import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Database, Pencil, Plus, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { api, ApiError } from '../lib/apiClient.js';
import { ErrorCard, LoadingSkeleton } from '../components/StateViews.js';
import { Modal } from '../components/ui/Modal.js';

/**
 * Gerenciador de dados (SUPERADMIN): adicionar, editar e excluir registros de qualquer tabela
 * — viagens, motoristas, veículos, clientes, fretes, WMS, portaria... Os formulários são
 * montados a partir do esquema real do banco, então tabelas/colunas novas aparecem sozinhas.
 */

interface Tabela {
  tabela: string;
  rotulo: string;
  grupo: string;
}
interface Coluna {
  nome: string;
  tipo: string;
  formato: string | null;
  obrigatoria: boolean;
  temPadrao: boolean;
  opcoes: string[] | null;
  referencia: string | null;
}
type Registro = Record<string, unknown>;
interface Pagina {
  data: Registro[];
  total: number;
  colunas: Coluna[];
}

const POR_PAGINA = 50;
const SO_LEITURA = new Set(['created_at', 'updated_at']);

function errMsg(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.problem.status === 403) return 'Só o SUPERADMIN pode usar o gerenciador de dados.';
    if (err.problem.status === 429) return 'Muitas requisições em pouco tempo. Aguarde alguns segundos e tente de novo.';
    return err.problem.detail ?? err.problem.title;
  }
  return 'Não foi possível falar com o servidor. Verifique a conexão e tente de novo.';
}

const ehJson = (c: Coluna) =>
  c.tipo === 'object' || c.tipo === 'array' || /json/.test(c.formato ?? '');
const ehData = (c: Coluna) => c.formato === 'date';
const ehNumero = (c: Coluna) => c.tipo === 'integer' || c.tipo === 'number';

/** Valor do banco -> texto do campo do formulário. */
function paraCampo(v: unknown, c: Coluna): string {
  if (v === null || v === undefined) return '';
  if (ehJson(c)) return JSON.stringify(v, null, 2);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (ehData(c)) return String(v).slice(0, 10);
  return String(v);
}

/** Valor curto para a tabela. */
function resumo(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 60);
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime()))
      return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
}

/** Colunas mostradas na tabela: as mais informativas primeiro, sem textos longos/JSON. */
function colunasVisiveis(colunas: Coluna[]): Coluna[] {
  const fora = new Set(['id', 'created_at', 'updated_at', 'deleted_at', 'created_by']);
  const boas = colunas.filter((c) => !fora.has(c.nome) && !ehJson(c) && c.formato !== 'uuid');
  return boas.slice(0, 7);
}

function CampoRegistro({
  col,
  valor,
  onChange,
  bloqueado,
}: {
  col: Coluna;
  valor: string;
  onChange: (v: string) => void;
  bloqueado: boolean;
}) {
  const base =
    'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-rigabras-500 focus:outline-none focus:ring-2 focus:ring-rigabras-500/20 disabled:bg-slate-50 disabled:text-slate-500';
  const id = `campo-${col.nome}`;
  let campo: ReactNode;
  if (col.tipo === 'boolean') {
    campo = (
      <select
        id={id}
        className={base}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        disabled={bloqueado}
      >
        <option value="">—</option>
        <option value="true">Sim</option>
        <option value="false">Não</option>
      </select>
    );
  } else if (col.opcoes) {
    campo = (
      <select
        id={id}
        className={base}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        disabled={bloqueado}
      >
        <option value="">—</option>
        {col.opcoes.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  } else if (ehJson(col)) {
    campo = (
      <textarea
        id={id}
        className={`${base} font-mono text-xs`}
        rows={4}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        disabled={bloqueado}
      />
    );
  } else {
    campo = (
      <input
        id={id}
        className={base}
        type={ehData(col) ? 'date' : 'text'}
        inputMode={ehNumero(col) ? 'decimal' : undefined}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        disabled={bloqueado}
        placeholder={
          /timestamp/.test(col.formato ?? '')
            ? 'AAAA-MM-DDTHH:MM (ex.: 2026-09-30T14:00)'
            : undefined
        }
      />
    );
  }
  return (
    <div className={ehJson(col) ? 'sm:col-span-2' : undefined}>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-600">
        {col.nome}
        {col.obrigatoria && !col.temPadrao ? <span className="text-red-600"> *</span> : null}
        {col.referencia ? (
          <span className="ml-1 font-normal text-slate-400">→ {col.referencia}</span>
        ) : null}
      </label>
      {campo}
    </div>
  );
}

export default function GerenciarDadosPage() {
  const [tabelas, setTabelas] = useState<Tabela[]>([]);
  const [tabela, setTabela] = useState<string>('viagens');
  const [pagina, setPagina] = useState(1);
  const [busca, setBusca] = useState('');
  const [buscaAplicada, setBuscaAplicada] = useState('');
  const [lixeira, setLixeira] = useState(false);
  const [dados, setDados] = useState<Pagina | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; erro: boolean } | null>(null);
  const [editando, setEditando] = useState<{
    registro: Registro | null;
    valores: Record<string, string>;
  } | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    api
      .get<{ data: Tabela[] }>('/admin/dados')
      .then((r) => {
        setTabelas(r.data);
        // Tabela inicial inexistente neste banco (migration pendente): abre a primeira da lista.
        setTabela((atual) => (r.data.some((t) => t.tabela === atual) ? atual : (r.data[0]?.tabela ?? atual)));
      })
      .catch((e) => setErro(errMsg(e)));
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const qs = new URLSearchParams({
        pagina: String(pagina),
        por_pagina: String(POR_PAGINA),
        excluidos: String(lixeira),
      });
      if (buscaAplicada) qs.set('q', buscaAplicada);
      setDados(await api.get<Pagina>(`/admin/dados/${tabela}?${qs.toString()}`));
    } catch (e) {
      setErro(errMsg(e));
    } finally {
      setCarregando(false);
    }
  }, [tabela, pagina, lixeira, buscaAplicada]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const grupos = useMemo(() => {
    const m = new Map<string, Tabela[]>();
    for (const t of tabelas) m.set(t.grupo, [...(m.get(t.grupo) ?? []), t]);
    return [...m.entries()];
  }, [tabelas]);
  const atual = tabelas.find((t) => t.tabela === tabela);
  const colunas = dados?.colunas ?? [];
  const visiveis = colunasVisiveis(colunas);
  const temLixeira = colunas.some((c) => c.nome === 'deleted_at');
  const paginas = Math.max(1, Math.ceil((dados?.total ?? 0) / POR_PAGINA));

  function trocarTabela(t: string) {
    setTabela(t);
    setPagina(1);
    setBusca('');
    setBuscaAplicada('');
    setLixeira(false);
    setAviso(null);
  }

  function abrir(registro: Registro | null) {
    const valores: Record<string, string> = {};
    for (const c of colunas) valores[c.nome] = registro ? paraCampo(registro[c.nome], c) : '';
    setEditando({ registro, valores });
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!editando) return;
    const { registro, valores } = editando;
    const alterados: Record<string, string | null> = {};
    for (const c of colunas) {
      if (SO_LEITURA.has(c.nome) || (registro && c.nome === 'id')) continue;
      const antes = registro ? paraCampo(registro[c.nome], c) : '';
      const agora = valores[c.nome] ?? '';
      if (registro ? agora !== antes : agora !== '')
        alterados[c.nome] = agora === '' ? null : agora;
    }
    if (registro && Object.keys(alterados).length === 0) {
      setEditando(null);
      return;
    }
    setSalvando(true);
    try {
      if (registro)
        await api.patch(`/admin/dados/${tabela}/${String(registro.id)}`, { dados: alterados });
      else await api.post(`/admin/dados/${tabela}`, { dados: alterados });
      setEditando(null);
      setAviso({ texto: registro ? 'Registro atualizado' : 'Registro criado', erro: false });
      await carregar();
    } catch (err) {
      setAviso({ texto: errMsg(err), erro: true });
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(r: Registro, definitivo: boolean) {
    const msg = definitivo
      ? 'Apagar DEFINITIVAMENTE este registro? Não dá para desfazer.'
      : temLixeira
        ? 'Mandar este registro para a lixeira? Dá para restaurar depois.'
        : 'Esta tabela não tem lixeira: o registro será apagado definitivamente. Continuar?';
    if (!window.confirm(msg)) return;
    try {
      await api.delete(`/admin/dados/${tabela}/${String(r.id)}?definitivo=${definitivo}`);
      setAviso({
        texto: definitivo || !temLixeira ? 'Registro apagado' : 'Registro enviado para a lixeira',
        erro: false,
      });
      await carregar();
    } catch (err) {
      setAviso({ texto: errMsg(err), erro: true });
    }
  }

  async function restaurar(r: Registro) {
    try {
      await api.patch(`/admin/dados/${tabela}/${String(r.id)}`, { dados: { deleted_at: null } });
      setAviso({ texto: 'Registro restaurado', erro: false });
      await carregar();
    } catch (err) {
      setAviso({ texto: errMsg(err), erro: true });
    }
  }

  const botao =
    'inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-all duration-200 hover:bg-slate-50';

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8" data-testid="gerenciar-dados-page">
      <div className="mb-6 flex items-center gap-2">
        <Database className="h-6 w-6 text-rigabras-500" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Gerenciar dados</h1>
          <p className="text-sm text-slate-500">
            Adicione, edite ou exclua qualquer registro do sistema. Toda alteração fica na
            auditoria.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        {/* Tabelas */}
        <nav aria-label="Tabelas" className="rounded-xl border border-slate-200 bg-white p-2">
          <select
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm lg:hidden"
            value={tabela}
            onChange={(e) => trocarTabela(e.target.value)}
            data-testid="dados-tabela-select"
          >
            {tabelas.map((t) => (
              <option key={t.tabela} value={t.tabela}>
                {t.grupo} › {t.rotulo}
              </option>
            ))}
          </select>
          <div className="hidden max-h-[75vh] overflow-y-auto lg:block">
            {grupos.map(([grupo, lista]) => (
              <div key={grupo} className="mb-2">
                <div className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {grupo}
                </div>
                {lista.map((t) => (
                  <button
                    key={t.tabela}
                    type="button"
                    onClick={() => trocarTabela(t.tabela)}
                    data-testid={`dados-tabela-${t.tabela}`}
                    className={`block w-full rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                      t.tabela === tabela
                        ? 'bg-rigabras-50 font-medium text-rigabras-700'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {t.rotulo}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </nav>

        {/* Registros */}
        <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="mr-auto text-lg font-semibold text-slate-900">
              {atual?.rotulo ?? tabela}
              {dados ? (
                <span className="ml-2 text-sm font-normal text-slate-500">
                  {dados.total} registro(s)
                </span>
              ) : null}
            </h2>
            <form
              className="flex items-center gap-1"
              onSubmit={(e) => {
                e.preventDefault();
                setPagina(1);
                setBuscaAplicada(busca.trim());
              }}
            >
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar…"
                aria-label="Buscar"
                className="w-40 rounded-xl border border-slate-300 px-3 py-2 text-sm sm:w-56"
                data-testid="dados-busca"
              />
              <button type="submit" className={botao} aria-label="Buscar">
                <Search className="h-4 w-4" />
              </button>
            </form>
            {temLixeira ? (
              <label className="flex items-center gap-1.5 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={lixeira}
                  onChange={(e) => {
                    setLixeira(e.target.checked);
                    setPagina(1);
                  }}
                  data-testid="dados-lixeira"
                />
                Lixeira
              </label>
            ) : null}
            <button
              type="button"
              onClick={() => abrir(null)}
              disabled={colunas.length === 0}
              className="inline-flex items-center gap-1.5 rounded-xl bg-rigabras-500 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-rigabras-600 disabled:opacity-50"
              data-testid="dados-novo"
            >
              <Plus className="h-4 w-4" /> Novo registro
            </button>
          </div>

          {aviso ? (
            <div
              role="status"
              className={`mb-3 rounded-xl border px-3 py-2 text-sm ${aviso.erro ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}
              data-testid="dados-aviso"
            >
              {aviso.texto}
            </div>
          ) : null}

          {erro ? (
            <ErrorCard message={erro} onRetry={() => void carregar()} />
          ) : carregando && !dados ? (
            <LoadingSkeleton rows={8} />
          ) : dados && dados.data.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-500">
              {lixeira ? 'A lixeira está vazia.' : 'Nenhum registro.'}
            </p>
          ) : dados ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm" data-testid="dados-tabela">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                    {visiveis.map((c) => (
                      <th key={c.nome} className="whitespace-nowrap px-2 py-2 font-medium">
                        {c.nome}
                      </th>
                    ))}
                    <th className="px-2 py-2 text-right font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.data.map((r) => (
                    <tr key={String(r.id)} className="border-b border-slate-100 hover:bg-slate-50">
                      {visiveis.map((c) => (
                        <td
                          key={c.nome}
                          className="max-w-[16rem] truncate px-2 py-2 text-slate-700"
                          title={resumo(r[c.nome])}
                        >
                          {resumo(r[c.nome])}
                        </td>
                      ))}
                      <td className="whitespace-nowrap px-2 py-1 text-right">
                        {lixeira ? (
                          <button
                            type="button"
                            onClick={() => void restaurar(r)}
                            className="rounded-lg p-1.5 text-emerald-700 hover:bg-emerald-50"
                            aria-label="Restaurar"
                            title="Restaurar"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => abrir(r)}
                            className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
                            aria-label="Editar"
                            title="Editar"
                            data-testid="dados-editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                        {!lixeira && temLixeira ? (
                          <button
                            type="button"
                            onClick={() => void excluir(r, false)}
                            className="rounded-lg p-1.5 text-amber-700 hover:bg-amber-50"
                            aria-label="Enviar para a lixeira"
                            title="Enviar para a lixeira"
                            data-testid="dados-excluir"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void excluir(r, true)}
                          className="rounded-lg p-1.5 text-red-600 hover:bg-red-50"
                          aria-label="Apagar definitivamente"
                          title="Apagar definitivamente"
                          data-testid="dados-apagar"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {dados && paginas > 1 ? (
            <div className="mt-3 flex items-center justify-end gap-2 text-sm">
              <button
                type="button"
                className={botao}
                disabled={pagina <= 1}
                onClick={() => setPagina((p) => p - 1)}
              >
                Anterior
              </button>
              <span className="text-slate-500">
                {pagina} / {paginas}
              </span>
              <button
                type="button"
                className={botao}
                disabled={pagina >= paginas}
                onClick={() => setPagina((p) => p + 1)}
              >
                Próxima
              </button>
            </div>
          ) : null}
        </section>
      </div>

      {editando ? (
        <Modal
          size="lg"
          titulo={
            editando.registro
              ? `Editar — ${atual?.rotulo ?? tabela}`
              : `Novo — ${atual?.rotulo ?? tabela}`
          }
          onClose={() => setEditando(null)}
        >
          <form onSubmit={salvar} data-testid="dados-form">
            <div className="grid gap-3 sm:grid-cols-2">
              {colunas
                .filter(
                  (c) =>
                    !(
                      editando.registro === null &&
                      (SO_LEITURA.has(c.nome) || c.nome === 'deleted_at')
                    ),
                )
                .map((c) => (
                  <CampoRegistro
                    key={c.nome}
                    col={c}
                    valor={editando.valores[c.nome] ?? ''}
                    bloqueado={
                      SO_LEITURA.has(c.nome) || (editando.registro !== null && c.nome === 'id')
                    }
                    onChange={(v) =>
                      setEditando((ed) =>
                        ed ? { ...ed, valores: { ...ed.valores, [c.nome]: v } } : ed,
                      )
                    }
                  />
                ))}
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Campo vazio = sem valor. Na criação, campos vazios com valor padrão (id, datas) são
              preenchidos pelo banco.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className={botao} onClick={() => setEditando(null)}>
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvando}
                className="rounded-xl bg-rigabras-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-rigabras-600 disabled:opacity-50"
                data-testid="dados-salvar"
              >
                {salvando ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
