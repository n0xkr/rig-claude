import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Loader2,
  MessageCircleQuestion,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import {
  ENTIDADE_ROTULO,
  RESPOSTA_EXTRA,
  RESPOSTA_IGNORAR,
  type IaEntidade,
  type IaSolicitacao,
  type ResultadoDecisao,
  type StatusSolicitacao,
  type TipoSolicitacao,
} from '@rigabras/shared';
import {
  PROCESSANDO_LOTE,
  useDecisoesSolicitacoesIa,
  useResumoSolicitacoesIa,
  useSolicitacoesIa,
} from '../hooks/useSolicitacoesIa.js';
import { LoadingSkeleton, ErrorCard, EmptyState } from '../components/StateViews.js';

// ---------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------

const TIPO_ROTULO: Record<TipoSolicitacao, string> = {
  CADASTRO: 'Cadastro',
  ATUALIZACAO: 'Atualização',
  PERGUNTA: 'Pergunta',
};

const TIPO_ESTILO: Record<TipoSolicitacao, string> = {
  CADASTRO: 'bg-emerald-50 text-emerald-700',
  ATUALIZACAO: 'bg-amber-50 text-amber-700',
  PERGUNTA: 'bg-violet-50 text-violet-700',
};

const STATUS_ROTULO: Record<StatusSolicitacao, string> = {
  PENDENTE: 'Pendente',
  APROVADA: 'Aprovada',
  RECUSADA: 'Recusada',
  RESPONDIDA: 'Respondida',
  ERRO: 'Erro',
};

const STATUS_ESTILO: Record<StatusSolicitacao, string> = {
  PENDENTE: 'bg-slate-200 text-slate-700',
  APROVADA: 'bg-emerald-50 text-emerald-700',
  RECUSADA: 'bg-slate-200 text-slate-600',
  RESPONDIDA: 'bg-cyan-50 text-cyan-700',
  ERRO: 'bg-red-50 text-red-700',
};

const STATUS_HISTORICO: StatusSolicitacao[] = ['APROVADA', 'RECUSADA', 'RESPONDIDA', 'ERRO'];
const ENTIDADES = Object.keys(ENTIDADE_ROTULO) as IaEntidade[];

const RE_ISO_DATA = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function vazio(v: unknown): boolean {
  return v === null || v === undefined || v === '';
}

function formatarValor(v: unknown): string {
  if (vazio(v)) return '—';
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  if (typeof v === 'number') return v.toLocaleString('pt-BR');
  if (typeof v === 'string') {
    const m = RE_ISO_DATA.exec(v);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return v;
  }
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

type Rotulos = Record<string, string> | undefined;

function rotuloChave(chave: string, rotulos?: Rotulos): string {
  if (rotulos?.[chave]) return rotulos[chave]!;
  const texto = chave.replace(/_/g, ' ').trim();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function formatarDataHora(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR');
}

function mensagemErroGenerica(erro: string | null | undefined): string {
  return erro && erro.trim() ? erro : 'Erro desconhecido';
}

const CLASSE_BADGE = 'rounded-full px-2.5 py-1 text-xs font-semibold';
const CLASSE_BTN_BASE =
  'inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20';
const CLASSE_BTN_PRIMARIO = `${CLASSE_BTN_BASE} bg-blue-600 text-white hover:opacity-90 transition-all duration-200`;
const CLASSE_BTN_SECUNDARIO = `${CLASSE_BTN_BASE} border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 transition-all duration-200`;
const CLASSE_CARD = 'rounded-xl border border-slate-200 bg-white shadow-sm';

// ---------------------------------------------------------------------------
// Blocos de dados
// ---------------------------------------------------------------------------

function TabelaChaveValor({
  dados,
  testId,
  rotulos,
}: {
  dados: Record<string, unknown>;
  testId?: string;
  rotulos?: Rotulos;
}) {
  const linhas = Object.entries(dados).filter(([, v]) => !vazio(v));
  if (linhas.length === 0) return <p className="text-sm text-slate-500">Sem dados informados.</p>;
  return (
    <dl
      className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[minmax(0,12rem)_1fr]"
      data-testid={testId}
    >
      {linhas.map(([chave, valor]) => (
        <div key={chave} className="contents">
          <dt className="text-slate-500">{rotuloChave(chave, rotulos)}</dt>
          <dd className="break-words text-slate-900">{formatarValor(valor)}</dd>
        </div>
      ))}
    </dl>
  );
}

function Recolhivel({
  titulo,
  children,
  testId,
}: {
  titulo: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <details
      className="group rounded-xl border border-slate-200 bg-white shadow-sm"
      data-testid={testId}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm text-slate-600 hover:text-slate-900 transition-all duration-200">
        <span>{titulo}</span>
        <ChevronDown
          className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="border-t border-slate-200 p-3">{children}</div>
    </details>
  );
}

function separarExtras(dados: Record<string, unknown>): {
  principais: Record<string, unknown>;
  extras: Record<string, unknown> | null;
} {
  const { dados_extras: extras, ...principais } = dados;
  return { principais, extras: isRecord(extras) && Object.keys(extras).length > 0 ? extras : null };
}

function DadosProposto({ dados, rotulos }: { dados: Record<string, unknown>; rotulos?: Rotulos }) {
  const { principais, extras } = separarExtras(dados);
  return (
    <div className="space-y-3">
      <TabelaChaveValor dados={principais} testId="solicitacao-dados-propostos" rotulos={rotulos} />
      {extras && (
        <Recolhivel titulo="Outras informações da planilha">
          <TabelaChaveValor dados={extras} />
        </Recolhivel>
      )}
    </div>
  );
}

function DiffAtualizacao({
  atuais,
  propostos,
  rotulos,
}: {
  atuais: Record<string, unknown> | null | undefined;
  propostos: Record<string, unknown> | null | undefined;
  rotulos?: Rotulos;
}) {
  const { principais } = separarExtras(propostos ?? {});
  const base = atuais ?? {};
  const mudancas = Object.entries(principais).filter(
    ([chave, proposto]) =>
      !vazio(proposto) && formatarValor(base[chave]) !== formatarValor(proposto),
  );
  if (mudancas.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Nenhuma diferença encontrada em relação ao cadastro atual.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto" data-testid="solicitacao-diff">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-slate-500">
          <tr>
            <th className="py-1 pr-3 font-medium">Campo</th>
            <th className="py-1 pr-3 font-medium">Atual</th>
            <th className="py-1 font-medium">Proposto</th>
          </tr>
        </thead>
        <tbody>
          {mudancas.map(([chave, proposto]) => (
            <tr key={chave} className="border-t border-slate-200 align-top">
              <td className="py-1.5 pr-3 text-slate-500">{rotuloChave(chave, rotulos)}</td>
              <td className="py-1.5 pr-3 text-red-600 line-through decoration-red-500/40">
                {formatarValor(base[chave])}
              </td>
              <td className="py-1.5 font-medium text-emerald-700">{formatarValor(proposto)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cartão de solicitação
// ---------------------------------------------------------------------------

interface CartaoProps {
  item: IaSolicitacao;
  selecionavel: boolean;
  selecionado: boolean;
  onAlternarSelecao: (id: string) => void;
  ocupado: boolean;
  processando: boolean;
  onAprovar: (item: IaSolicitacao) => Promise<void>;
  onRecusar: (item: IaSolicitacao, motivo: string) => Promise<void>;
  onResponder: (item: IaSolicitacao, resposta: { opcao?: string; texto?: string }) => Promise<void>;
}

function SolicitacaoCard({
  item,
  selecionavel,
  selecionado,
  onAlternarSelecao,
  ocupado,
  processando,
  onAprovar,
  onRecusar,
  onResponder,
}: CartaoProps) {
  const [recusando, setRecusando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [opcao, setOpcao] = useState<string | null>(null);
  const [texto, setTexto] = useState('');

  const ehPergunta = item.tipo === 'PERGUNTA';
  const permiteDecidirCadastro =
    !ehPergunta && (item.status === 'PENDENTE' || item.status === 'ERRO');
  const permiteResponder = ehPergunta && item.status === 'PENDENTE';
  const origem = [
    item.aba ? `Aba: ${item.aba}` : null,
    item.linha != null ? `Linha ${item.linha}` : null,
    item.coluna ? `Coluna: ${item.coluna}` : null,
  ].filter((v): v is string => v !== null);
  const opcoes = item.opcoes ?? [];
  const sugestao = item.sugestao_ia ?? null;
  const sugestaoNaLista = sugestao ? opcoes.some((o) => o.valor === sugestao.valor) : false;
  const rotuloSugestao = sugestao
    ? (opcoes.find((o) => o.valor === sugestao.valor)?.rotulo ?? sugestao.valor)
    : '';
  const pctSugestao = sugestao ? Math.round(sugestao.confianca * 100) : 0;
  const respostaValida =
    item.entrada === 'TEXTO'
      ? texto.trim().length > 0
      : item.entrada === 'OPCAO'
        ? opcao !== null
        : false;
  const rotuloIdEntrada = `pergunta-${item.id}`;

  return (
    <article
      className={`${CLASSE_CARD} p-4 sm:p-5 ${selecionado ? 'ring-2 ring-blue-500/30' : ''}`}
      data-testid="solicitacao-card"
      data-tipo={item.tipo}
      data-status={item.status}
      aria-busy={processando}
    >
      <header className="flex flex-wrap items-start gap-3">
        {selecionavel && (
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 accent-cyan-400"
            checked={selecionado}
            onChange={() => onAlternarSelecao(item.id)}
            disabled={ocupado}
            aria-label={`Selecionar solicitação: ${item.titulo}`}
            data-testid="solicitacao-selecionar"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className={`${CLASSE_BADGE} ${TIPO_ESTILO[item.tipo]}`}>
              {TIPO_ROTULO[item.tipo]}
            </span>
            <span className={`${CLASSE_BADGE} bg-slate-100 text-slate-700`}>
              {ENTIDADE_ROTULO[item.entidade]}
            </span>
            {item.status !== 'PENDENTE' && (
              <span className={`${CLASSE_BADGE} ${STATUS_ESTILO[item.status]}`}>
                {STATUS_ROTULO[item.status]}
              </span>
            )}
          </div>
          <h3 className="break-words text-base font-bold text-slate-900">{item.titulo}</h3>
          {item.descricao && <p className="mt-1 text-sm text-slate-600">{item.descricao}</p>}
          {(origem.length > 0 || item.chave_natural) && (
            <p className="mt-1.5 text-xs text-slate-500">
              {[...origem, item.chave_natural ? `Chave: ${item.chave_natural}` : null]
                .filter((v): v is string => v !== null)
                .join(' · ')}
            </p>
          )}
        </div>
        <time className="text-xs text-slate-500" dateTime={item.created_at}>
          {formatarDataHora(item.created_at)}
        </time>
      </header>

      <div className="mt-4 space-y-3">
        {item.tipo === 'CADASTRO' && item.dados_propostos && (
          <DadosProposto dados={item.dados_propostos} rotulos={item.rotulos_campos} />
        )}

        {item.tipo === 'ATUALIZACAO' && (
          <DiffAtualizacao
            atuais={item.dados_atuais}
            propostos={item.dados_propostos}
            rotulos={item.rotulos_campos}
          />
        )}

        {ehPergunta && (
          <div className="space-y-3">
            {item.pergunta && <p className="text-sm font-medium text-slate-900">{item.pergunta}</p>}

            {sugestao && (
              <div
                className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm"
                data-testid="solicitacao-sugestao"
              >
                <p className="flex flex-wrap items-center gap-2 font-medium text-violet-700">
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                  Sugestão da IA ({pctSugestao}% de confiança)
                </p>
                <p className="mt-1 text-slate-700">
                  {rotuloSugestao}
                  {sugestao.motivo ? (
                    <span className="text-slate-500"> — {sugestao.motivo}</span>
                  ) : null}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  É apenas uma sugestão: nada é aplicado sem a sua escolha.
                </p>
              </div>
            )}

            {permiteResponder && item.entrada === 'OPCAO' && (
              <fieldset className="space-y-2" aria-describedby={rotuloIdEntrada}>
                <legend id={rotuloIdEntrada} className="sr-only">
                  Opções de resposta
                </legend>
                {opcoes.map((o) => {
                  const marcada = opcao === o.valor;
                  const reservada = o.valor === RESPOSTA_IGNORAR || o.valor === RESPOSTA_EXTRA;
                  const sugerida = sugestaoNaLista && sugestao?.valor === o.valor;
                  return (
                    <label
                      key={o.valor}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm transition-all ${
                        marcada
                          ? 'border-blue-500 bg-blue-50 text-slate-900'
                          : `${reservada ? 'border-dashed' : ''} border-slate-200 bg-white text-slate-700 hover:bg-slate-50`
                      }`}
                    >
                      <input
                        type="radio"
                        name={`opcao-${item.id}`}
                        className="h-4 w-4 accent-cyan-400"
                        value={o.valor}
                        checked={marcada}
                        onChange={() => setOpcao(o.valor)}
                        disabled={ocupado}
                      />
                      <span className="min-w-0 flex-1 break-words">{o.rotulo}</span>
                      {sugerida && sugestao && (
                        <span className="shrink-0 rounded-full bg-violet-50 px-2 py-0.5 text-xs text-violet-700">
                          Sugestão da IA ({pctSugestao}%)
                        </span>
                      )}
                    </label>
                  );
                })}
              </fieldset>
            )}

            {permiteResponder && item.entrada === 'TEXTO' && (
              <div>
                <label htmlFor={`texto-${item.id}`} className="mb-1 block text-xs text-slate-500">
                  Sua resposta
                </label>
                <input
                  id={`texto-${item.id}`}
                  className="input"
                  value={texto}
                  maxLength={500}
                  onChange={(e) => setTexto(e.target.value)}
                  disabled={ocupado}
                  placeholder="Digite a resposta"
                  data-testid="solicitacao-texto"
                />
              </div>
            )}

            {item.dados_propostos && Object.keys(item.dados_propostos).length > 0 && (
              <Recolhivel titulo="Registro que será criado após a sua resposta">
                <DadosProposto dados={item.dados_propostos} rotulos={item.rotulos_campos} />
              </Recolhivel>
            )}

            {item.status === 'RESPONDIDA' && item.resposta && (
              <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3">
                <p className="mb-1 text-xs font-medium uppercase text-cyan-700">
                  Resposta registrada
                </p>
                <TabelaChaveValor dados={item.resposta} />
              </div>
            )}
          </div>
        )}

        {item.evidencia && Object.keys(item.evidencia).length > 0 && (
          <Recolhivel titulo="Ver dados originais da planilha">
            <TabelaChaveValor dados={item.evidencia} />
          </Recolhivel>
        )}

        {item.status === 'ERRO' && (
          <p
            className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            role="alert"
            data-testid="solicitacao-erro"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{mensagemErroGenerica(item.erro)}</span>
          </p>
        )}

        {(item.status === 'APROVADA' ||
          item.status === 'RECUSADA' ||
          item.status === 'RESPONDIDA') &&
          item.decidido_em && (
            <p className="text-xs text-slate-500">
              {STATUS_ROTULO[item.status]} em {formatarDataHora(item.decidido_em)}
            </p>
          )}
      </div>

      {permiteDecidirCadastro && (
        <div className="mt-4 border-t border-slate-200 pt-4">
          {recusando ? (
            <form
              className="flex flex-col gap-2 sm:flex-row sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                void onRecusar(item, motivo);
              }}
            >
              <div className="flex-1">
                <label htmlFor={`motivo-${item.id}`} className="mb-1 block text-xs text-slate-500">
                  Motivo da recusa (opcional)
                </label>
                <input
                  id={`motivo-${item.id}`}
                  className="input"
                  value={motivo}
                  maxLength={500}
                  onChange={(e) => setMotivo(e.target.value)}
                  disabled={ocupado}
                  placeholder="Ex.: dado duplicado"
                  data-testid="solicitacao-motivo"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className={`${CLASSE_BTN_BASE} bg-red-600 text-white hover:opacity-90 transition-all duration-200`}
                  disabled={ocupado}
                  aria-label={`Confirmar recusa: ${item.titulo}`}
                  data-testid="solicitacao-recusar-confirmar"
                >
                  {processando ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <X className="h-4 w-4" aria-hidden="true" />
                  )}
                  Confirmar recusa
                </button>
                <button
                  type="button"
                  className={CLASSE_BTN_SECUNDARIO}
                  onClick={() => {
                    setRecusando(false);
                    setMotivo('');
                  }}
                  disabled={ocupado}
                  aria-label="Cancelar recusa"
                >
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={CLASSE_BTN_PRIMARIO}
                onClick={() => void onAprovar(item)}
                disabled={ocupado}
                aria-label={
                  item.status === 'ERRO'
                    ? `Tentar aprovar novamente: ${item.titulo}`
                    : `Aprovar: ${item.titulo}`
                }
                data-testid="solicitacao-aprovar"
              >
                {processando ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Check className="h-4 w-4" aria-hidden="true" />
                )}
                {item.status === 'ERRO' ? 'Tentar aprovar de novo' : 'Aprovar'}
              </button>
              {item.status === 'PENDENTE' && (
                <button
                  type="button"
                  className={CLASSE_BTN_SECUNDARIO}
                  onClick={() => setRecusando(true)}
                  disabled={ocupado}
                  aria-label={`Recusar: ${item.titulo}`}
                  data-testid="solicitacao-recusar"
                >
                  <X className="h-4 w-4" aria-hidden="true" /> Recusar
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {permiteResponder && (
        <div className="mt-4 border-t border-slate-200 pt-4">
          <button
            type="button"
            className={CLASSE_BTN_PRIMARIO}
            onClick={() =>
              void onResponder(
                item,
                item.entrada === 'TEXTO' ? { texto: texto.trim() } : { opcao: opcao ?? undefined },
              )
            }
            disabled={ocupado || !respostaValida}
            aria-label={`Responder: ${item.titulo}`}
            data-testid="solicitacao-responder"
          >
            {processando ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Send className="h-4 w-4" aria-hidden="true" />
            )}
            Responder
          </button>
        </div>
      )}
    </article>
  );
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

type Aba = 'pendentes' | 'perguntas' | 'historico';
type TipoChip = 'TODOS' | 'CADASTRO' | 'ATUALIZACAO';

interface Aviso {
  tipo: 'ok' | 'erro';
  texto: string;
}

interface ResumoLote {
  ok: number;
  falhas: { id: string; titulo: string; erro: string }[];
}

function Chip({
  ativo,
  onClick,
  children,
  testId,
}: {
  ativo: boolean;
  onClick: () => void;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      data-testid={testId}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20 ${
        ativo
          ? 'border-blue-500 bg-blue-50 text-blue-600'
          : 'border-slate-200 text-slate-600 hover:bg-slate-100 transition-all duration-200'
      }`}
    >
      {children}
    </button>
  );
}

function Contador({ valor, alerta }: { valor: number | undefined; alerta?: boolean }) {
  if (valor === undefined) return null;
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
        alerta && valor > 0 ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-700'
      }`}
    >
      {valor}
    </span>
  );
}

/** Solicitações da IA: a IA nunca grava sozinha — o administrador aprova, recusa ou responde. */
export default function SolicitacoesIaPage() {
  const [aba, setAba] = useState<Aba>('pendentes');
  const [tipoChip, setTipoChip] = useState<TipoChip>('TODOS');
  const [statusHistorico, setStatusHistorico] = useState<StatusSolicitacao | ''>('');
  const [entidade, setEntidade] = useState<IaEntidade | ''>('');
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [lote, setLote] = useState<ResumoLote | null>(null);

  const filtros = useMemo(() => {
    const base = { entidade: entidade || undefined };
    if (aba === 'perguntas')
      return { ...base, status: 'PENDENTE' as const, tipo: 'PERGUNTA' as const };
    if (aba === 'historico') {
      return statusHistorico
        ? { ...base, status: statusHistorico }
        : { ...base, excluirStatus: 'PENDENTE' as const };
    }
    return {
      ...base,
      status: 'PENDENTE' as const,
      tipo: tipoChip === 'TODOS' ? undefined : tipoChip,
    };
  }, [aba, tipoChip, statusHistorico, entidade]);

  const { itens, carregando, carregandoMais, erro, temMais, carregarMais, recarregar } =
    useSolicitacoesIa(filtros);
  const { resumo, recarregar: recarregarResumo } = useResumoSolicitacoesIa({ pollMs: 30000 });
  const decisoes = useDecisoesSolicitacoesIa();

  // Ao trocar de aba/filtro, descarta seleção e mensagens antigas.
  useEffect(() => {
    setSelecionados(new Set());
    setLote(null);
  }, [filtros]);

  const selecionaveis = useMemo(
    () => itens.filter((s) => s.status === 'PENDENTE' && s.tipo !== 'PERGUNTA'),
    [itens],
  );
  const idsSelecionados = useMemo(
    () => selecionaveis.filter((s) => selecionados.has(s.id)).map((s) => s.id),
    [selecionaveis, selecionados],
  );
  const ocupado = decisoes.processandoId !== null;
  const todosSelecionados =
    selecionaveis.length > 0 && idsSelecionados.length === selecionaveis.length;

  async function atualizarTudo() {
    await Promise.all([recarregar(), recarregarResumo()]);
  }

  function alternarSelecao(id: string) {
    setSelecionados((prev) => {
      const prox = new Set(prev);
      if (prox.has(id)) prox.delete(id);
      else prox.add(id);
      return prox;
    });
  }

  function alternarTodos() {
    setSelecionados(todosSelecionados ? new Set() : new Set(selecionaveis.map((s) => s.id)));
  }

  async function aprovar(item: IaSolicitacao) {
    setAviso(null);
    const res = await decisoes.aprovar(item.id);
    if (!res) return;
    setAviso(
      res.status === 'ERRO'
        ? {
            tipo: 'erro',
            texto: `Não foi possível gravar "${item.titulo}": ${mensagemErroGenerica(res.erro)}`,
          }
        : { tipo: 'ok', texto: `Solicitação aprovada: ${item.titulo}` },
    );
    await atualizarTudo();
  }

  async function recusar(item: IaSolicitacao, motivo: string) {
    setAviso(null);
    const res = await decisoes.recusar(item.id, motivo);
    if (!res) return;
    setAviso({ tipo: 'ok', texto: `Solicitação recusada: ${item.titulo}` });
    await atualizarTudo();
  }

  async function responder(item: IaSolicitacao, resposta: { opcao?: string; texto?: string }) {
    setAviso(null);
    const res = await decisoes.responder(item.id, resposta);
    if (!res) return;
    setAviso(
      res.status === 'ERRO'
        ? {
            tipo: 'erro',
            texto: `A resposta foi recebida, mas a gravação falhou: ${mensagemErroGenerica(res.erro)}`,
          }
        : { tipo: 'ok', texto: `Pergunta respondida: ${item.titulo}` },
    );
    await atualizarTudo();
  }

  async function aprovarSelecionados() {
    if (idsSelecionados.length === 0) return;
    setAviso(null);
    setLote(null);
    const resultados = await decisoes.aprovarLote(idsSelecionados);
    if (!resultados) return;
    const titulos = new Map(itens.map((s) => [s.id, s.titulo]));
    const falhas = resultados
      .filter((r: ResultadoDecisao) => !r.ok)
      .map((r) => ({
        id: r.id,
        titulo: titulos.get(r.id) ?? r.id,
        erro: mensagemErroGenerica(r.erro),
      }));
    setLote({ ok: resultados.length - falhas.length, falhas });
    setSelecionados(new Set());
    await atualizarTudo();
  }

  function mudarAba(nova: Aba) {
    setAba(nova);
    setAviso(null);
  }

  const processandoLote = decisoes.processandoId === PROCESSANDO_LOTE;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8" data-testid="solicitacoes-ia-page">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="h-6 w-6 text-blue-600" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-slate-900">Solicitações da IA</h1>
      </div>
      <p className="mb-6 max-w-2xl text-sm text-slate-500">
        A IA nunca grava sozinha: aprove, recuse ou responda. Ao ler uma planilha ela abre
        solicitações de cadastro e atualização e, quando não tem certeza do que um dado significa,
        faz uma pergunta em vez de supor.
      </p>

      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Seções">
        <Chip
          ativo={aba === 'pendentes'}
          onClick={() => mudarAba('pendentes')}
          testId="aba-pendentes"
        >
          Pendentes <Contador valor={resumo?.pendentes} />
        </Chip>
        <Chip
          ativo={aba === 'perguntas'}
          onClick={() => mudarAba('perguntas')}
          testId="aba-perguntas"
        >
          <MessageCircleQuestion className="h-4 w-4" aria-hidden="true" /> Perguntas{' '}
          <Contador valor={resumo?.perguntas} />
        </Chip>
        <Chip
          ativo={aba === 'historico'}
          onClick={() => mudarAba('historico')}
          testId="aba-historico"
        >
          Histórico <Contador valor={resumo?.erros} alerta />
        </Chip>
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        {aba === 'pendentes' && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Tipo de solicitação">
            <Chip ativo={tipoChip === 'TODOS'} onClick={() => setTipoChip('TODOS')}>
              Todas
            </Chip>
            <Chip ativo={tipoChip === 'CADASTRO'} onClick={() => setTipoChip('CADASTRO')}>
              Cadastros <Contador valor={resumo?.cadastros} />
            </Chip>
            <Chip ativo={tipoChip === 'ATUALIZACAO'} onClick={() => setTipoChip('ATUALIZACAO')}>
              Atualizações <Contador valor={resumo?.atualizacoes} />
            </Chip>
          </div>
        )}
        {aba === 'historico' && (
          <div className="sm:w-56">
            <label htmlFor="filtro-status" className="sr-only">
              Filtrar por status
            </label>
            <select
              id="filtro-status"
              className="input"
              value={statusHistorico}
              onChange={(e) => setStatusHistorico(e.target.value as StatusSolicitacao | '')}
              data-testid="filtro-status"
            >
              <option value="">Todos os status</option>
              {STATUS_HISTORICO.map((s) => (
                <option key={s} value={s}>
                  {STATUS_ROTULO[s]}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="sm:w-56">
          <label htmlFor="filtro-entidade" className="sr-only">
            Filtrar por entidade
          </label>
          <select
            id="filtro-entidade"
            className="input"
            value={entidade}
            onChange={(e) => setEntidade(e.target.value as IaEntidade | '')}
            data-testid="filtro-entidade"
          >
            <option value="">Todas as entidades</option>
            {ENTIDADES.map((e) => (
              <option key={e} value={e}>
                {ENTIDADE_ROTULO[e]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {aviso && (
        <p
          className={`mb-4 flex items-start gap-2 rounded-xl border p-3 text-sm ${
            aviso.tipo === 'erro'
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
          }`}
          role={aviso.tipo === 'erro' ? 'alert' : 'status'}
          data-testid="solicitacoes-aviso"
        >
          {aviso.tipo === 'erro' ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span>{aviso.texto}</span>
        </p>
      )}

      {decisoes.erro && (
        <p
          className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          role="alert"
          data-testid="solicitacoes-erro-acao"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{decisoes.erro}</span>
        </p>
      )}

      {lote && (
        <div
          className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm"
          role={lote.falhas.length > 0 ? 'alert' : 'status'}
          data-testid="solicitacoes-lote-resultado"
        >
          <p className="text-slate-900">
            Aprovação em lote:{' '}
            <span className="font-semibold text-emerald-700">{lote.ok} com sucesso</span>
            {lote.falhas.length > 0 && (
              <>
                {', '}
                <span className="font-semibold text-red-700">{lote.falhas.length} com falha</span>
              </>
            )}
            .
          </p>
          {lote.falhas.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-red-700">
              {lote.falhas.map((f) => (
                <li key={f.id}>
                  <span className="text-slate-700">{f.titulo}</span>: {f.erro}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {selecionaveis.length > 0 && (
        <div
          className={`${CLASSE_CARD} mb-4 flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between`}
          data-testid="solicitacoes-acoes-lote"
        >
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4 accent-cyan-400"
              checked={todosSelecionados}
              onChange={alternarTodos}
              disabled={ocupado}
              aria-label="Selecionar todos desta página"
            />
            Selecionar todos desta página
          </label>
          <button
            type="button"
            className={CLASSE_BTN_PRIMARIO}
            onClick={() => void aprovarSelecionados()}
            disabled={ocupado || idsSelecionados.length === 0}
            aria-label={`Aprovar selecionados (${idsSelecionados.length})`}
            data-testid="solicitacoes-aprovar-lote"
          >
            {processandoLote ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="h-4 w-4" aria-hidden="true" />
            )}
            Aprovar selecionados ({idsSelecionados.length})
          </button>
        </div>
      )}

      {carregando && itens.length === 0 ? (
        <LoadingSkeleton />
      ) : erro && itens.length === 0 ? (
        <ErrorCard message={erro} onRetry={() => void recarregar()} />
      ) : itens.length === 0 ? (
        <EmptyState
          title={
            aba === 'historico'
              ? 'Nenhuma solicitação no histórico'
              : aba === 'perguntas'
                ? 'Nenhuma pergunta pendente'
                : 'Nenhuma solicitação pendente'
          }
          description={
            aba === 'historico'
              ? 'Quando você aprovar, recusar ou responder solicitações, elas aparecerão aqui.'
              : 'Tudo em dia. Novas solicitações aparecem aqui quando a IA analisar uma planilha.'
          }
        />
      ) : (
        <div className="space-y-4" data-testid="solicitacoes-lista">
          {itens.map((item) => (
            <SolicitacaoCard
              key={item.id}
              item={item}
              selecionavel={item.status === 'PENDENTE' && item.tipo !== 'PERGUNTA'}
              selecionado={selecionados.has(item.id)}
              onAlternarSelecao={alternarSelecao}
              ocupado={ocupado}
              processando={decisoes.processandoId === item.id}
              onAprovar={aprovar}
              onRecusar={recusar}
              onResponder={responder}
            />
          ))}
          {erro && (
            <p className="text-sm text-red-600" role="alert">
              {erro}
            </p>
          )}
          {temMais && (
            <button
              type="button"
              onClick={() => void carregarMais()}
              disabled={carregandoMais}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50 transition-all duration-200 bg-white shadow-sm"
              data-testid="solicitacoes-carregar-mais"
            >
              {carregandoMais && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Carregar mais
            </button>
          )}
        </div>
      )}
    </div>
  );
}
