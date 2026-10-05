import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Plus, X } from 'lucide-react';
import { TipoVeiculoSchema } from '@rigabras/shared';
import { api, ApiError } from '../lib/apiClient.js';

/**
 * "+ Adicionar novo" dentro dos seletores: cadastra o que falta (depositante,
 * produto, armazém, endereço, motorista, veículo) num modal, sem sair do
 * formulário que está sendo preenchido. Ao salvar, o novo registro já fica
 * selecionado no campo.
 *
 * Uso:
 *   const novo = useCadastroRapido();
 *   <select value={v} onChange={novo.aoMudar('depositante', setV, reload)}>
 *     ...opções
 *     <OpcaoAdicionarNovo />
 *   </select>
 *   {novo.modal}
 */

export const VALOR_NOVO = '__novo__';

export type TipoCadastroRapido = 'depositante' | 'produto' | 'armazem' | 'endereco' | 'motorista' | 'veiculo';

/** Dados que o cadastro precisa do formulário de origem (ex.: produto pertence a um depositante). */
export interface ContextoCadastro {
  depositante_id?: string;
  armazem_id?: string;
}

interface Campo {
  nome: string;
  rotulo: string;
  obrigatorio?: boolean;
  tipo?: 'text' | 'number' | 'select';
  opcoes?: Array<{ valor: string; rotulo: string }>;
  padrao?: string;
  maiusculas?: boolean;
}

const TIPOS_VEICULO: Record<string, string> = {
  CAVALO: 'Cavalo',
  CARRETA_ABERTA: 'Carreta aberta',
  CARRETA_SIDER: 'Carreta sider',
  CARRETA_OUTRO: 'Carreta (outro)',
};

const DEFS: Record<
  TipoCadastroRapido,
  {
    titulo: string;
    rota: string;
    campos: Campo[];
    montar: (f: Record<string, string>, ctx: ContextoCadastro) => Record<string, unknown>;
    precisa?: keyof ContextoCadastro;
  }
> = {
  depositante: {
    titulo: 'Novo depositante',
    rota: '/wms/depositantes',
    campos: [
      { nome: 'razao_social', rotulo: 'Razão social', obrigatorio: true },
      { nome: 'cnpj_cpf', rotulo: 'CNPJ/CPF', obrigatorio: true },
      { nome: 'contato_nome', rotulo: 'Contato' },
      { nome: 'contato_telefone', rotulo: 'Telefone' },
    ],
    montar: (f) => ({ ...f, ativo: true }),
  },
  produto: {
    titulo: 'Novo produto',
    rota: '/wms/produtos',
    precisa: 'depositante_id',
    campos: [
      { nome: 'sku', rotulo: 'SKU / código', obrigatorio: true, maiusculas: true },
      { nome: 'descricao', rotulo: 'Descrição', obrigatorio: true },
      { nome: 'numero_produto', rotulo: 'Nº do produto' },
      { nome: 'unidade_medida', rotulo: 'Unidade', padrao: 'UN', maiusculas: true },
      { nome: 'peso_kg', rotulo: 'Peso (kg)', tipo: 'number' },
    ],
    montar: (f, ctx) => ({
      depositante_id: ctx.depositante_id,
      sku: f.sku,
      descricao: f.descricao,
      numero_produto: f.numero_produto || undefined,
      unidade_medida: f.unidade_medida || 'UN',
      ...(f.peso_kg ? { peso_kg: Number(f.peso_kg.replace(',', '.')) } : {}),
      ativo: true,
    }),
  },
  armazem: {
    titulo: 'Novo armazém',
    rota: '/wms/armazens',
    campos: [
      { nome: 'nome', rotulo: 'Nome', obrigatorio: true, padrao: 'Armazém Uruguaiana' },
      { nome: 'endereco', rotulo: 'Endereço' },
      { nome: 'area_m2', rotulo: 'Área (m²)', tipo: 'number', padrao: '5500' },
    ],
    montar: (f) => ({
      nome: f.nome,
      endereco: f.endereco || null,
      area_m2: f.area_m2 ? Number(f.area_m2.replace(',', '.')) : null,
    }),
  },
  endereco: {
    titulo: 'Novo endereço (bin)',
    rota: '/wms/enderecos',
    precisa: 'armazem_id',
    campos: [
      { nome: 'area', rotulo: 'Área', obrigatorio: true, maiusculas: true },
      { nome: 'rua', rotulo: 'Rua', obrigatorio: true, maiusculas: true },
      { nome: 'prateleira', rotulo: 'Prateleira', obrigatorio: true, maiusculas: true },
      { nome: 'posicao', rotulo: 'Posição', obrigatorio: true, maiusculas: true },
    ],
    montar: (f, ctx) => ({ armazem_id: ctx.armazem_id, ...f }),
  },
  motorista: {
    titulo: 'Novo motorista',
    rota: '/motoristas',
    campos: [
      { nome: 'nome_completo', rotulo: 'Nome completo', obrigatorio: true, maiusculas: true },
      { nome: 'cpf', rotulo: 'CPF' },
      { nome: 'cnh', rotulo: 'CNH' },
      { nome: 'telefone', rotulo: 'Telefone' },
    ],
    montar: (f) => ({
      nome_completo: f.nome_completo,
      cpf: f.cpf ? f.cpf.replace(/\D/g, '') : null,
      cnh: f.cnh || null,
      telefone: f.telefone || null,
      frota_propria: true,
      ativo: true,
    }),
  },
  veiculo: {
    titulo: 'Novo veículo',
    rota: '/veiculos',
    campos: [
      { nome: 'placa', rotulo: 'Placa', obrigatorio: true, maiusculas: true },
      {
        nome: 'tipo',
        rotulo: 'Tipo',
        tipo: 'select',
        padrao: 'CAVALO',
        opcoes: TipoVeiculoSchema.options.map((t) => ({ valor: t, rotulo: TIPOS_VEICULO[t] ?? t })),
      },
      { nome: 'marca', rotulo: 'Marca' },
      { nome: 'modelo', rotulo: 'Modelo' },
    ],
    montar: (f) => ({
      placa: f.placa.replace(/[^A-Za-z0-9]/g, '').toUpperCase(),
      tipo: f.tipo || 'CAVALO',
      marca: f.marca || null,
      modelo: f.modelo || null,
      frota_propria: true,
      ativo: true,
    }),
  },
};

/** Quando o formulário de origem não informa o vínculo, o próprio modal pergunta. */
const VINCULO: Record<keyof ContextoCadastro, { rotulo: string; rota: string; nome: (r: Record<string, unknown>) => string }> = {
  depositante_id: {
    rotulo: 'Depositante',
    rota: '/wms/depositantes?limit=100',
    nome: (r) => String(r.razao_social ?? r.id),
  },
  armazem_id: { rotulo: 'Armazém', rota: '/wms/armazens', nome: (r) => String(r.nome ?? r.id) },
};

/** Última opção de qualquer seletor de cadastro. */
export function OpcaoAdicionarNovo({ rotulo = '+ Adicionar novo...' }: { rotulo?: string }) {
  return <option value={VALOR_NOVO}>{rotulo}</option>;
}

export type Criado = { id: string } & Record<string, unknown>;

interface Aberto {
  tipo: TipoCadastroRapido;
  contexto: ContextoCadastro;
  inicial?: Record<string, string>;
  aoCriar: (r: Criado) => void;
}

export function useCadastroRapido() {
  const [aberto, setAberto] = useState<Aberto | null>(null);

  const abrir = useCallback(
    (tipo: TipoCadastroRapido, aoCriar: (r: Criado) => void, contexto: ContextoCadastro = {}, inicial?: Record<string, string>) =>
      setAberto({ tipo, aoCriar, contexto, inicial }),
    [],
  );

  /**
   * onChange do <select>: "+ Adicionar novo" abre o cadastro; qualquer outra
   * opção segue para `setValor`. Após criar, recarrega a lista e seleciona o novo.
   */
  const aoMudar = useCallback(
    (
      tipo: TipoCadastroRapido,
      setValor: (id: string) => void,
      recarregar?: () => unknown,
      contexto: ContextoCadastro = {},
      valorDe: (r: Criado) => string = (r) => r.id,
    ) =>
      (e: ChangeEvent<HTMLSelectElement>) => {
        if (e.target.value !== VALOR_NOVO) {
          setValor(e.target.value);
          return;
        }
        abrir(
          tipo,
          (r) => {
            void Promise.resolve(recarregar?.()).then(() => setValor(valorDe(r)));
          },
          contexto,
        );
      },
    [abrir],
  );

  const modal = aberto ? (
    <ModalCadastro
      {...aberto}
      onClose={() => setAberto(null)}
      onCriado={(r) => {
        aberto.aoCriar(r);
        setAberto(null);
      }}
    />
  ) : null;

  return { abrir, aoMudar, modal };
}

/** Botão "+ Novo" ao lado de um campo que não é <select> (ex.: input com datalist). */
export function BotaoNovo({ onClick, children = 'Novo' }: { onClick: () => void; children?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-medium text-blue-700 shadow-sm hover:bg-blue-50"
    >
      <Plus className="h-3.5 w-3.5" /> {children}
    </button>
  );
}

function ModalCadastro({
  tipo,
  contexto,
  inicial,
  onClose,
  onCriado,
}: Aberto & { onClose: () => void; onCriado: (r: Criado) => void }) {
  const def = DEFS[tipo];
  const [form, setForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(def.campos.map((c) => [c.nome, inicial?.[c.nome] ?? c.padrao ?? ''])),
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Vínculo (depositante do produto / armazém do endereço) que o formulário de origem não informou.
  const vinculo = def.precisa && !contexto[def.precisa] ? def.precisa : null;
  const [vinculoId, setVinculoId] = useState('');
  const [vinculos, setVinculos] = useState<Array<Record<string, unknown>>>([]);
  useEffect(() => {
    if (!vinculo) return;
    api
      .get<{ data: Array<Record<string, unknown>> }>(VINCULO[vinculo].rota)
      .then((r) => {
        setVinculos(r.data);
        if (r.data.length === 1) setVinculoId(String(r.data[0]!.id));
      })
      .catch(() => setVinculos([]));
  }, [vinculo]);
  const bloqueado = !!vinculo && !vinculoId;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation(); // o modal fica dentro de outro <form>: não submeter o de fora
    if (bloqueado) return;
    setSalvando(true);
    setErro(null);
    try {
      const limpo = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim()]));
      const ctx = vinculo ? { ...contexto, [vinculo]: vinculoId } : contexto;
      const r = await api.post<Criado>(def.rota, def.montar(limpo, ctx));
      onCriado(r);
    } catch (err) {
      setErro(err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Não foi possível salvar');
    } finally {
      setSalvando(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <form
        onSubmit={salvar}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md space-y-3 rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
        data-testid={`cadastro-rapido-${tipo}`}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">{def.titulo}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>
        {vinculo && (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-600">{VINCULO[vinculo].rotulo} *</span>
            <select className="input" required value={vinculoId} onChange={(e) => setVinculoId(e.target.value)}>
              <option value="">Selecione...</option>
              {vinculos.map((v) => (
                <option key={String(v.id)} value={String(v.id)}>
                  {VINCULO[vinculo].nome(v)}
                </option>
              ))}
            </select>
            {vinculos.length === 0 && (
              <span className="mt-1 block text-xs text-amber-700">
                Nenhum {VINCULO[vinculo].rotulo.toLowerCase()} cadastrado — cadastre primeiro.
              </span>
            )}
          </label>
        )}
        {def.campos.map((c) => (
          <label key={c.nome} className="block">
            <span className="mb-1 block text-sm font-medium text-slate-600">
              {c.rotulo}
              {c.obrigatorio ? ' *' : ''}
            </span>
            {c.tipo === 'select' ? (
              <select
                className="input"
                value={form[c.nome]}
                onChange={(e) => setForm((f) => ({ ...f, [c.nome]: e.target.value }))}
              >
                {c.opcoes?.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.rotulo}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="input"
                required={c.obrigatorio}
                inputMode={c.tipo === 'number' ? 'decimal' : undefined}
                value={form[c.nome]}
                onChange={(e) =>
                  setForm((f) => ({ ...f, [c.nome]: c.maiusculas ? e.target.value.toUpperCase() : e.target.value }))
                }
              />
            )}
          </label>
        ))}
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando || bloqueado}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Salvar e selecionar
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
