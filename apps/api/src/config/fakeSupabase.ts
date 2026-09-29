/**
 * Cliente Supabase falso, em memória, usado apenas quando `USE_FAKE_DB=true`
 * (ver `supabase.ts`). Existe porque este sandbox de testes não tem Docker
 * disponível (`docker`/`supabase start` não funcionam aqui), então não há
 * como rodar um Supabase local real para exercitar a API/Playwright de ponta
 * a ponta. Esta é a única alternativa honesta descrita no plano de testes:
 * um "fake" que imita a API encadeável do `@supabase/supabase-js`
 * (`.from().select().eq()...`) o suficiente para que TODO o código real de
 * repository/service/controller/rota rode sem alteração, apenas trocando o
 * I/O (Postgres real) por um Map em memória.
 *
 * NUNCA usado em produção: `USE_FAKE_DB` só existe para dev local sem
 * Docker e para a suíte Playwright deste sandbox (ver README, seção
 * "Testes"). RLS/migrations continuam SEM verificação contra um Postgres
 * real — essa ressalva pré-existente do projeto não muda.
 *
 * Cobertura deliberadamente parcial: implementa só os operadores realmente
 * usados pelos repositories (`eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `is`,
 * `in`, `not`, `order`, `limit`, `range`) e um resolvedor simples de embed
 * (`alias:tabela(*)` -> resolve `row[alias + '_id']` contra a tabela
 * indicada), que cobre o único join usado no código
 * (`eventos_fronteira` -> `viagem:viagens(*)`).
 */

import { randomUUID } from 'node:crypto';

type Row = Record<string, unknown>;

interface Filter {
  col: string;
  op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'is' | 'in' | 'like' | 'ilike';
  value: unknown;
  negate?: boolean;
}

interface OrderSpec {
  col: string;
  ascending: boolean;
}

/**
 * Emula os `DEFAULT '...'` de coluna do Postgres real para colunas que os
 * Zod `Create*Schema` deliberadamente OMITEM do payload de criação (o
 * comentário em `packages/shared/src/entities/frete.ts` é explícito: "toda
 * transição de estado passa pelo endpoint dedicado" — o valor inicial vem
 * do DEFAULT da coluna, não do Zod). Sem isso, uma linha criada no fake
 * fica com esses campos `undefined`, e qualquer máquina de estados que leia
 * `row.status` quebra (bug real encontrado testando o fechamento de frete:
 * `TRANSICOES_STATUS_FECHAMENTO_FRETE[undefined]` -> `.includes` de
 * `undefined`). Mantido como uma tabela pequena e explícita (não uma
 * introspecção genérica do schema SQL) — ver migrations 0001/0004/0006 para
 * a fonte de cada valor.
 */
const TABLE_COLUMN_DEFAULTS: Record<string, Row> = {
  eventos_risco: { severidade: 'BAIXA', status: 'ABERTO' },
  fretes: { status_fechamento: 'ABERTO' },
  pagamentos_frete: { status: 'PENDENTE' },
  produtos_armazenados: { unidade_medida: 'UN' },
  enderecos_armazem: { status: 'LIVRE' },
  recebimentos: { status: 'AGUARDANDO' },
  expedicoes: { tipo: 'NORMAL', status: 'SOLICITADA' },
  inventarios: { status: 'ABERTO' },
  portaria_entradas: { tipo_operacao: 'DESCARGA', status: 'AGUARDANDO_CONFERENCIA' },
  ordens_servico: { status: 'ABERTA' },
  ia_solicitacoes: { status: 'PENDENTE' },
  import_datasets: {
    origem: 'EXCEL',
    status: 'VALIDADO',
    total_linhas: 0,
    linhas_importadas: 0,
    linhas_com_erro: 0,
  },
};

function genId(): string {
  return globalThis.crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

function matchesFilter(row: Row, f: Filter): boolean {
  // Uma coluna nunca escrita em memória equivale a NULL no Postgres real
  // (ex: `deleted_at` de uma linha recém-criada), então `undefined` é
  // normalizado para `null` antes de qualquer comparação.
  const rowValue = row[f.col] === undefined ? null : row[f.col];
  let result: boolean;
  switch (f.op) {
    case 'eq':
      result = rowValue === f.value;
      break;
    case 'neq':
      result = rowValue !== f.value;
      break;
    case 'gt':
      result = rowValue != null && (rowValue as string | number) > (f.value as string | number);
      break;
    case 'gte':
      result = rowValue != null && (rowValue as string | number) >= (f.value as string | number);
      break;
    case 'lt':
      result = rowValue != null && (rowValue as string | number) < (f.value as string | number);
      break;
    case 'lte':
      result = rowValue != null && (rowValue as string | number) <= (f.value as string | number);
      break;
    case 'is':
      result = rowValue === f.value;
      break;
    case 'in':
      result = Array.isArray(f.value) && (f.value as unknown[]).includes(rowValue);
      break;
    case 'like':
    case 'ilike': {
      const pattern = String(f.value).replace(/%/g, '.*');
      const flags = f.op === 'ilike' ? 'i' : '';
      result = new RegExp(`^${pattern}$`, flags).test(String(rowValue ?? ''));
      break;
    }
    default:
      result = true;
  }
  return f.negate ? !result : result;
}

function parseEmbeds(selectExpr: string): Array<{ alias: string; table: string }> {
  const embeds: Array<{ alias: string; table: string }> = [];
  const re = /(\w+):(\w+)\(\*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(selectExpr)) !== null) {
    embeds.push({ alias: m[1]!, table: m[2]! });
  }
  return embeds;
}

export interface FakeSupabaseStore {
  tables: Map<string, Row[]>;
  authUsers: Map<string, { id: string; email: string; password: string }>;
}

export function createFakeStore(): FakeSupabaseStore {
  return { tables: new Map(), authUsers: new Map() };
}

class FakeQueryBuilder implements PromiseLike<{ data: unknown; error: unknown }> {
  private filters: Filter[] = [];
  private orderSpecs: OrderSpec[] = [];
  private limitN: number | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private mode: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
  private upsertConflictCol = 'id';
  private writePayload: Row | Row[] | null = null;
  private selectExpr = '*';
  private singleMode: 'single' | 'maybeSingle' | null = null;

  constructor(
    private readonly store: FakeSupabaseStore,
    private readonly table: string,
  ) {}

  private rows(): Row[] {
    if (!this.store.tables.has(this.table)) this.store.tables.set(this.table, []);
    return this.store.tables.get(this.table)!;
  }

  select(expr = '*'): this {
    this.selectExpr = expr;
    if (this.mode === 'select') this.mode = 'select';
    return this;
  }

  insert(payload: Row | Row[]): this {
    this.mode = 'insert';
    this.writePayload = payload;
    return this;
  }

  /** `upsert(..., { onConflict })`: atualiza a linha com a mesma chave ou insere uma nova. */
  upsert(payload: Row | Row[], opts?: { onConflict?: string }): this {
    this.mode = 'upsert';
    this.writePayload = payload;
    this.upsertConflictCol = opts?.onConflict ?? 'id';
    return this;
  }

  update(payload: Row): this {
    this.mode = 'update';
    this.writePayload = payload;
    return this;
  }

  delete(): this {
    this.mode = 'delete';
    return this;
  }

  eq(col: string, value: unknown): this {
    this.filters.push({ col, op: 'eq', value });
    return this;
  }
  neq(col: string, value: unknown): this {
    this.filters.push({ col, op: 'neq', value });
    return this;
  }
  gt(col: string, value: unknown): this {
    this.filters.push({ col, op: 'gt', value });
    return this;
  }
  gte(col: string, value: unknown): this {
    this.filters.push({ col, op: 'gte', value });
    return this;
  }
  lt(col: string, value: unknown): this {
    this.filters.push({ col, op: 'lt', value });
    return this;
  }
  lte(col: string, value: unknown): this {
    this.filters.push({ col, op: 'lte', value });
    return this;
  }
  is(col: string, value: unknown): this {
    this.filters.push({ col, op: 'is', value });
    return this;
  }
  in(col: string, value: unknown[]): this {
    this.filters.push({ col, op: 'in', value });
    return this;
  }
  like(col: string, value: unknown): this {
    this.filters.push({ col, op: 'like', value });
    return this;
  }
  ilike(col: string, value: unknown): this {
    this.filters.push({ col, op: 'ilike', value });
    return this;
  }
  not(col: string, op: Filter['op'], value: unknown): this {
    this.filters.push({ col, op, value, negate: true });
    return this;
  }
  or(): this {
    // Não implementado de forma genérica (não usado nos repositories atuais
    // além de casos triviais); mantido como no-op documentado.
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }): this {
    this.orderSpecs.push({ col, ascending: opts?.ascending ?? true });
    return this;
  }

  limit(n: number): this {
    this.limitN = n;
    return this;
  }

  range(from: number, to: number): this {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }

  single(): this {
    this.singleMode = 'single';
    return this;
  }

  maybeSingle(): this {
    this.singleMode = 'maybeSingle';
    return this;
  }

  private applyEmbeds(rows: Row[]): Row[] {
    const embeds = parseEmbeds(this.selectExpr);
    if (embeds.length === 0) return rows;
    return rows.map((row) => {
      const clone = { ...row };
      for (const embed of embeds) {
        const fkValue = row[`${embed.alias}_id`];
        const targetRows = this.store.tables.get(embed.table) ?? [];
        clone[embed.alias] = targetRows.find((r) => r.id === fkValue) ?? null;
      }
      return clone;
    });
  }

  private execute(): { data: unknown; error: unknown } {
    const result = this.computeData();
    // Clona o resultado antes de devolver: o Supabase real serializa cada
    // resposta via HTTP/JSON, então o chamador nunca recebe uma referência
    // viva à linha armazenada. Sem isso, um objeto lido antes de um
    // `.update()` sofreria mutação retroativa quando a linha subjacente
    // fosse alterada (bug real encontrado ao testar `changeStatus` —
    // `status_anterior`/`status_novo` do histórico saíam iguais porque
    // `current` e a linha atualizada eram o mesmo objeto em memória).
    return { data: structuredClone(result.data), error: result.error };
  }

  private computeData(): { data: unknown; error: unknown } {
    const all = this.rows();

    if (this.mode === 'insert') {
      const inputRows = Array.isArray(this.writePayload) ? this.writePayload : [this.writePayload!];
      const defaults = TABLE_COLUMN_DEFAULTS[this.table];
      const created = inputRows.map((r) => ({
        id: genId(),
        created_at: nowIso(),
        updated_at: nowIso(),
        ...defaults,
        ...r,
      }));
      all.push(...created);
      const data = this.singleMode ? (created[0] ?? null) : created;
      return { data, error: null };
    }

    if (this.mode === 'upsert') {
      const inputRows = Array.isArray(this.writePayload) ? this.writePayload : [this.writePayload!];
      const col = this.upsertConflictCol;
      const defaults = TABLE_COLUMN_DEFAULTS[this.table];
      const saved = inputRows.map((r) => {
        const existing = r[col] != null ? all.find((row) => row[col] === r[col]) : undefined;
        if (existing) return Object.assign(existing, r, { updated_at: nowIso() });
        const created = {
          id: genId(),
          created_at: nowIso(),
          updated_at: nowIso(),
          ...defaults,
          ...r,
        };
        all.push(created);
        return created;
      });
      const data = this.singleMode ? (saved[0] ?? null) : saved;
      return { data, error: null };
    }

    if (this.mode === 'update') {
      const matched = all.filter((row) => this.filters.every((f) => matchesFilter(row, f)));
      matched.forEach((row) => Object.assign(row, this.writePayload, { updated_at: nowIso() }));
      if (this.singleMode === 'single' && matched.length === 0) {
        return { data: null, error: { message: 'Nenhuma linha encontrada', code: 'PGRST116' } };
      }
      const data = this.singleMode ? (matched[0] ?? null) : matched;
      return { data, error: null };
    }

    if (this.mode === 'delete') {
      const matched = all.filter((row) => this.filters.every((f) => matchesFilter(row, f)));
      const remaining = all.filter((row) => !matched.includes(row));
      this.store.tables.set(this.table, remaining);
      return { data: null, error: null };
    }

    // select
    let filtered = all.filter((row) => this.filters.every((f) => matchesFilter(row, f)));
    for (const spec of [...this.orderSpecs].reverse()) {
      filtered = [...filtered].sort((a, b) => {
        const av = a[spec.col] as string | number | null;
        const bv = b[spec.col] as string | number | null;
        if (av == null && bv == null) return 0;
        if (av == null) return spec.ascending ? -1 : 1;
        if (bv == null) return spec.ascending ? 1 : -1;
        if (av < bv) return spec.ascending ? -1 : 1;
        if (av > bv) return spec.ascending ? 1 : -1;
        return 0;
      });
    }
    if (this.rangeFrom != null && this.rangeTo != null) {
      filtered = filtered.slice(this.rangeFrom, this.rangeTo + 1);
    } else if (this.limitN != null) {
      filtered = filtered.slice(0, this.limitN);
    }
    filtered = this.applyEmbeds(filtered);

    if (this.singleMode === 'single' && filtered.length === 0) {
      return { data: null, error: { message: 'Nenhuma linha encontrada', code: 'PGRST116' } };
    }
    const data = this.singleMode ? (filtered[0] ?? null) : filtered;
    return { data, error: null };
  }

  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onfulfilled?:
      ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled, onrejected);
  }
}

export interface FakeSupabaseClient {
  from(table: string): FakeQueryBuilder;
  auth: {
    signInWithPassword(creds: {
      email: string;
      password: string;
    }): Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }>;
    admin: {
      createUser(input: { email: string; password: string; email_confirm?: boolean }): Promise<{
        data: { user: { id: string } | null };
        error: { message: string; status?: number } | null;
      }>;
      deleteUser(id: string): Promise<{ error: { message: string } | null }>;
      updateUserById(
        id: string,
        attrs: { password?: string },
      ): Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }>;
    };
  };
}

export function createFakeSupabaseClient(store: FakeSupabaseStore): FakeSupabaseClient {
  return {
    from(table: string) {
      return new FakeQueryBuilder(store, table);
    },
    auth: {
      async signInWithPassword({ email, password }) {
        const user = store.authUsers.get(email);
        if (!user || user.password !== password) {
          return { data: { user: null }, error: { message: 'Invalid login credentials' } };
        }
        return { data: { user: { id: user.id } }, error: null };
      },
      admin: {
        async createUser({ email, password }) {
          if (store.authUsers.has(email)) {
            return {
              data: { user: null },
              error: {
                message: 'A user with this email address has already been registered',
                status: 422,
              },
            };
          }
          const id = randomUUID();
          store.authUsers.set(email, { id, email, password });
          return { data: { user: { id } }, error: null };
        },
        async deleteUser(id: string) {
          for (const [email, user] of store.authUsers) {
            if (user.id === id) store.authUsers.delete(email);
          }
          // Emula o FK `profiles.id -> auth.users(id) on delete cascade` do banco real.
          const profiles = store.tables.get('profiles');
          if (profiles)
            store.tables.set(
              'profiles',
              profiles.filter((p) => p.id !== id),
            );
          return { error: null };
        },
        async updateUserById(id: string, attrs: { password?: string }) {
          for (const user of store.authUsers.values()) {
            if (user.id === id) {
              if (attrs.password) user.password = attrs.password;
              return { data: { user: { id } }, error: null };
            }
          }
          return { data: { user: null }, error: { message: 'User not found' } };
        },
      },
    },
  };
}
