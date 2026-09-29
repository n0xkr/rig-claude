import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Database,
  FileSpreadsheet,
  Link2,
  Loader2,
  Sparkles,
  UploadCloud,
  X,
} from 'lucide-react';
import {
  STATUS_VIAGEM_LABEL,
  TIPO_ABA_IMPORTACAO_LABEL,
  type ImportacaoInteligenteInput,
  type ImportacaoInteligenteResultado,
  type StatusViagem,
} from '@rigabras/shared';
import { lerPlanilhaCompleta } from '../lib/lerPlanilha.js';
import { api, ApiError } from '../lib/apiClient.js';
import { haptic } from '../lib/haptics.js';

type Arquivos = ImportacaoInteligenteInput['arquivos'];

const msg = (err: unknown) =>
  err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : err instanceof Error ? err.message : 'Erro inesperado';

async function lerArquivos(files: File[]): Promise<Arquivos> {
  const out: Arquivos = [];
  for (const f of files) {
    const scan = await lerPlanilhaCompleta(f);
    out.push({
      nome: f.name,
      abas: scan.abas
        .filter((a) => a.tipo === 'TABELA' && a.linhas.length > 0)
        .map((a) => ({ nome: a.nome, cabecalhos: a.cabecalhos, linhas: a.linhas as Array<Record<string, unknown>> })),
    });
  }
  return out;
}

/**
 * Importação sem mapeamento manual: o usuário só solta as planilhas. O sistema
 * lê todas as abas, entende o que cada uma é, cruza as informações e mostra o
 * que vai gravar; um clique grava tudo no banco.
 */
export function ImportacaoInteligente({ onImported }: { onImported?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [nomes, setNomes] = useState<string[]>([]);
  const [arquivos, setArquivos] = useState<Arquivos | null>(null);
  const [fase, setFase] = useState<'inicio' | 'lendo' | 'analisando' | 'previa' | 'gravando' | 'gravado'>('inicio');
  const [resultado, setResultado] = useState<ImportacaoInteligenteResultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [abasAbertas, setAbasAbertas] = useState(false);

  async function receber(files: File[]) {
    if (files.length === 0) return;
    setErro(null);
    setResultado(null);
    setNomes(files.map((f) => f.name));
    setFase('lendo');
    try {
      const lidos = await lerArquivos(files);
      if (lidos.every((a) => a.abas.length === 0)) throw new Error('Nenhuma tabela com dados foi encontrada nos arquivos.');
      setArquivos(lidos);
      setFase('analisando');
      const r = await api.post<ImportacaoInteligenteResultado>('/importacoes/inteligente', { modo: 'previa', arquivos: lidos });
      setResultado(r);
      setFase('previa');
    } catch (err) {
      setErro(msg(err));
      setFase('inicio');
    }
  }

  async function gravar() {
    if (!arquivos) return;
    setErro(null);
    setFase('gravando');
    try {
      const r = await api.post<ImportacaoInteligenteResultado>('/importacoes/inteligente', { modo: 'gravar', arquivos });
      setResultado(r);
      setFase('gravado');
      haptic(r.erros.length === 0 ? 'success' : 'warning');
      onImported?.();
    } catch (err) {
      setErro(msg(err));
      setFase('previa');
    }
  }

  function reiniciar() {
    setArquivos(null);
    setResultado(null);
    setNomes([]);
    setErro(null);
    setFase('inicio');
  }

  const ocupado = fase === 'lendo' || fase === 'analisando' || fase === 'gravando';
  const r = resultado;
  const t = r?.totais;
  const nadaParaGravar =
    !!t &&
    [t.viagens, t.veiculos, t.motoristas, t.clientes].every((c) => c.novos + c.atualizados === 0) &&
    t.cargas.novos === 0;

  return (
    <div className="space-y-4" data-testid="importacao-inteligente">
      {fase === 'inicio' || ocupado ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (!ocupado) void receber(Array.from(e.dataTransfer.files ?? []));
          }}
          onClick={() => !ocupado && inputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-blue-200 bg-blue-50 px-4 py-10 text-center"
        >
          {ocupado ? <Loader2 className="h-9 w-9 animate-spin text-blue-600" /> : <UploadCloud className="h-9 w-9 text-blue-600" />}
          <p className="text-sm font-semibold text-slate-900">
            {fase === 'lendo'
              ? 'Lendo as planilhas...'
              : fase === 'analisando'
                ? 'Entendendo e cruzando as informações...'
                : fase === 'gravando'
                  ? 'Gravando no banco de dados...'
                  : 'Solte aqui as planilhas (ou clique para escolher)'}
          </p>
          <p className="max-w-md text-xs text-slate-500">
            .xlsx, .xls ou .csv — pode enviar vários arquivos de uma vez. Não precisa mapear colunas: o sistema reconhece
            cada aba pelo nome das colunas, cruza viagens, motoristas, veículos, CRT/DANFE, checklists e SMP, e mostra tudo
            antes de gravar.
          </p>
          {nomes.length > 0 && <p className="text-xs text-blue-700">{nomes.join(' · ')}</p>}
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".xlsx,.xls,.csv"
            className="hidden"
            data-testid="importacao-inteligente-arquivo"
            onChange={(e) => {
              const fs = Array.from(e.target.files ?? []);
              e.target.value = '';
              void receber(fs);
            }}
          />
        </div>
      ) : null}

      {erro && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert" data-testid="importacao-erro">
          {erro}
        </p>
      )}

      {r && (fase === 'previa' || fase === 'gravado' || fase === 'gravando') && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              {fase === 'gravado' ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" /> Importação gravada
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5 text-blue-600" /> Prévia — nada foi gravado ainda
                </>
              )}
            </p>
            <button type="button" onClick={reiniciar} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900">
              <X className="h-3.5 w-3.5" /> Importar outros arquivos
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5" data-testid="importacao-totais">
            {(
              [
                ['Viagens', t!.viagens],
                ['Motoristas', t!.motoristas],
                ['Veículos', t!.veiculos],
                ['Clientes', t!.clientes],
                ['CRT/DANFE', t!.cargas],
              ] as const
            ).map(([rotulo, c]) => (
              <div key={rotulo} className="rounded-xl border border-slate-200 bg-white p-3 text-center shadow-sm">
                <p className="text-xs font-medium text-slate-500">{rotulo}</p>
                <p className="text-xl font-bold text-emerald-600">+{c.novos}</p>
                <p className="text-[11px] text-slate-500">
                  {c.atualizados} atualiz. · {c.iguais} iguais
                </p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Link2 className="h-4 w-4 text-blue-600" /> Cruzamento de informações
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-600 sm:grid-cols-4">
              <span>{r.cruzamentos.viagens_com_motorista} viagens com motorista</span>
              <span>{r.cruzamentos.viagens_com_carreta} com carreta</span>
              <span>{r.cruzamentos.viagens_com_documentos} com CRT/DANFE</span>
              <span>{r.cruzamentos.status_deduzidos} etapas deduzidas</span>
              <span>{r.cruzamentos.pesquisa_ok} pesquisa OK</span>
              <span>{r.cruzamentos.checklist_ok} checklist OK</span>
              <span>{r.cruzamentos.smp_ok} SMP OK</span>
              <span>{r.ia_disponivel ? 'IA ativa' : 'IA indisponível (só dicionário)'}</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => setAbasAbertas((v) => !v)}
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-900"
            >
              <span className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-blue-600" /> Como cada aba foi entendida ({r.abas.length})
              </span>
              {abasAbertas ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
            {abasAbertas && (
              <ul className="divide-y divide-slate-200 border-t border-slate-200" data-testid="importacao-abas">
                {r.abas.map((a) => (
                  <li key={`${a.arquivo}/${a.aba}`} className="px-4 py-3 text-xs">
                    <p className="font-medium text-slate-800">
                      {a.aba}{' '}
                      <span className={a.tipo === 'ignorada' ? 'text-slate-400' : 'text-blue-600'}>
                        → {TIPO_ABA_IMPORTACAO_LABEL[a.tipo]}
                        {a.origemTipo === 'ia' ? ' (IA)' : ''}
                      </span>{' '}
                      <span className="text-slate-400">· {a.linhas} linhas</span>
                    </p>
                    {a.observacao && <p className="text-slate-500">{a.observacao}</p>}
                    {a.tipo !== 'ignorada' && (
                      <p className="mt-1 flex flex-wrap gap-1">
                        {a.colunas.map((c) => (
                          <span
                            key={c.coluna}
                            title={c.campo ? `${c.coluna} → ${c.rotulo}` : `${c.coluna}: guardada como informação extra`}
                            className={`rounded px-1.5 py-0.5 ${
                              c.origem === 'ia'
                                ? 'bg-violet-50 text-violet-700'
                                : c.campo
                                  ? 'bg-blue-50 text-blue-700'
                                  : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {c.coluna}
                            {c.rotulo ? ` → ${c.rotulo}` : ''}
                          </span>
                        ))}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {r.viagens.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full min-w-[46rem] text-left text-xs" data-testid="importacao-viagens">
                <thead className="bg-slate-50 uppercase text-slate-500">
                  <tr>
                    <th className="p-2">Ação</th>
                    <th className="p-2">Viagem</th>
                    <th className="p-2">Cavalo / carreta</th>
                    <th className="p-2">Motorista</th>
                    <th className="p-2">Rota</th>
                    <th className="p-2">Etapa</th>
                    <th className="p-2">Docs</th>
                    <th className="p-2">P/C/S</th>
                  </tr>
                </thead>
                <tbody>
                  {r.viagens.slice(0, 100).map((v, i) => (
                    <tr key={i} className="border-t border-slate-200" title={v.fontes.join('\n')}>
                      <td className="p-2">
                        <span
                          className={`rounded px-1.5 py-0.5 font-semibold ${
                            v.acao === 'criar'
                              ? 'bg-emerald-50 text-emerald-700'
                              : v.acao === 'atualizar'
                                ? 'bg-blue-50 text-blue-700'
                                : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {v.acao === 'criar' ? 'nova' : v.acao === 'atualizar' ? 'atualiza' : 'igual'}
                        </span>
                      </td>
                      <td className="p-2 font-medium text-slate-900">{v.chave}</td>
                      <td className="p-2">
                        {v.placa_cavalo}
                        {v.placa_carreta ? ` + ${v.placa_carreta}` : ''}
                      </td>
                      <td className="p-2">{v.motorista ?? '—'}</td>
                      <td className="p-2">
                        {v.origem} → {v.destino}
                      </td>
                      <td className="p-2">{STATUS_VIAGEM_LABEL[v.status as StatusViagem] ?? v.status}</td>
                      <td className="p-2">{v.documentos.length}</td>
                      <td className="p-2">
                        {[v.pesquisa_ok, v.checklist_ok, v.smp_ok].map((x) => (x ? '✓' : x === false ? '✗' : '·')).join(' ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {r.viagens.length > 100 && (
                <p className="px-3 py-2 text-xs text-slate-500">… e mais {r.viagens.length - 100} viagens.</p>
              )}
            </div>
          )}

          {(r.erros.length > 0 || r.avisos.length > 0) && (
            <div className="max-h-56 overflow-auto rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              {r.erros.map((e, i) => (
                <p key={`e${i}`} className="flex items-start gap-1">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  {e.aba}
                  {e.linha ? ` (linha ${e.linha})` : ''}: {e.mensagem}
                </p>
              ))}
              {r.avisos.map((a, i) => (
                <p key={`a${i}`}>• {a}</p>
              ))}
            </div>
          )}

          {fase !== 'gravado' ? (
            <button
              type="button"
              onClick={() => void gravar()}
              disabled={fase === 'gravando' || nadaParaGravar}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              data-testid="importacao-gravar"
            >
              {fase === 'gravando' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
              {nadaParaGravar ? 'Tudo já está atualizado no sistema' : 'Gravar tudo no sistema'}
            </button>
          ) : (
            <div className="flex flex-wrap gap-2 text-sm" data-testid="importacao-concluida">
              <Link to="/viagens" className="btn-brand">
                Ver viagens
              </Link>
              <Link to="/acompanhamento" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-slate-700 shadow-sm">
                Ver frota
              </Link>
              <Link to="/motoristas" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-slate-700 shadow-sm">
                Ver motoristas
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
