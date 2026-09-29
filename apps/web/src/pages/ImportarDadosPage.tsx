import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { ImportTarget, ValidarImportacaoResult, ImportDataset, PlanilhaEscaneada } from '@rigabras/shared';
import { IMPORT_TARGET_FIELDS, mapearPorNome, pontuarAlvo } from '@rigabras/shared';
import { lerPlanilhaCompleta } from '../lib/lerPlanilha.js';
import { useImportacaoActions } from '../hooks/useImportacao.js';
import { AiImportWizard } from '../components/AiImportWizard.js';

const TARGET_LABELS: Record<ImportTarget, string> = {
  viagens: 'Viagens (TMS / Gerenciamento de Risco)',
  manutencoes_veiculo: 'Manutenções de veículo (Frota)',
  veiculos: 'Veículos (Frota / acompanhamento)',
};

/**
 * Importação de dados (Módulo 9) — ponte manual via Excel/CSV até a
 * integração com Google Sheets existir (documento de evolução, seções
 * 15-18): upload -> pré-visualização -> mapeamento de colunas -> validação
 * -> importação. Nunca apaga dados existentes; cada lote fica registrado
 * como um dataset auditável. O arquivo é varrido inteiro (todas as abas, cabeçalho
 * em qualquer linha); o usuário escolhe qual aba importar, com a melhor já pré-selecionada.
 */
export default function ImportarDadosPage() {
  const { validar, importar, listarHistorico, submitting, error } = useImportacaoActions();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [target, setTarget] = useState<ImportTarget>('viagens');
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [scan, setScan] = useState<PlanilhaEscaneada | null>(null);
  const [abaAtual, setAbaAtual] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [linhasBrutas, setLinhasBrutas] = useState<Array<Record<string, unknown>>>([]);
  const [mapeamento, setMapeamento] = useState<Record<string, string>>({});
  const [validacao, setValidacao] = useState<ValidarImportacaoResult | null>(null);
  const [resultadoImportacao, setResultadoImportacao] = useState<{
    dataset: ImportDataset;
    erros: { linha: number; campo?: string | null; mensagem: string }[];
  } | null>(null);
  const [historico, setHistorico] = useState<ImportDataset[]>([]);

  const campos = IMPORT_TARGET_FIELDS[target];

  useEffect(() => {
    void listarHistorico().then((r) => r && setHistorico(r));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetArquivo() {
    setScan(null);
    setAbaAtual('');
    setHeaders([]);
    setLinhasBrutas([]);
    setMapeamento({});
    setValidacao(null);
    setResultadoImportacao(null);
  }

  /** Carrega uma aba: cabeçalhos/linhas reais + sugestão de mapeamento por nome (com sinônimos). */
  function selecionarAba(planilha: PlanilhaEscaneada, nomeAba: string, alvo: ImportTarget) {
    const aba = planilha.abas.find((a) => a.nome === nomeAba);
    setAbaAtual(nomeAba);
    setValidacao(null);
    setResultadoImportacao(null);
    setHeaders(aba?.cabecalhos ?? []);
    setLinhasBrutas(aba?.linhas ?? []);
    const sugestao = mapearPorNome(alvo, aba?.cabecalhos ?? []);
    // mapeamento manual é campo -> coluna (inverso do retornado por mapearPorNome)
    const porCampo: Record<string, string> = {};
    for (const [coluna, campo] of Object.entries(sugestao)) if (campo) porCampo[campo] = coluna;
    setMapeamento(porCampo);
  }

  /** Aba mais parecida com o destino escolhido — nunca a "primeira aba" às cegas. */
  function melhorAba(planilha: PlanilhaEscaneada, alvo: ImportTarget): string {
    const tabelas = planilha.abas.filter((a) => a.tipo === 'TABELA' && a.linhas.length > 0);
    const ranqueadas = tabelas
      .map((a) => ({ nome: a.nome, ...pontuarAlvo(alvo, a.cabecalhos) }))
      .sort((x, y) => Number(y.obrigatoriosOk) - Number(x.obrigatoriosOk) || y.pontos - x.pontos);
    return ranqueadas[0]?.nome ?? tabelas[0]?.nome ?? '';
  }

  async function handleFile(file: File) {
    resetArquivo();
    setNomeArquivo(file.name);
    const planilha = await lerPlanilhaCompleta(file);
    setScan(planilha);
    selecionarAba(planilha, melhorAba(planilha, target), target);
  }

  const abasComDados = scan?.abas.filter((a) => a.tipo === 'TABELA' && a.linhas.length > 0) ?? [];

  const linhasMapeadas = useMemo(() => {
    return linhasBrutas.map((linha) => {
      const mapeada: Record<string, unknown> = {};
      for (const campo of campos) {
        const coluna = mapeamento[campo.key];
        if (coluna) mapeada[campo.key] = linha[coluna];
      }
      return mapeada;
    });
  }, [linhasBrutas, mapeamento, campos]);

  async function handleValidar() {
    const resultado = await validar(target, linhasMapeadas);
    if (resultado) setValidacao(resultado);
    setResultadoImportacao(null);
  }

  async function handleImportar() {
    const nome = nomeArquivo || `Importação ${TARGET_LABELS[target]}`;
    const resultado = await importar(target, nome, 'EXCEL', linhasMapeadas);
    if (resultado) {
      setResultadoImportacao(resultado);
      const atualizado = await listarHistorico();
      if (atualizado) setHistorico(atualizado);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link
        to="/importar-ia"
        className="mb-3 inline-block text-xs text-tms-cyan hover:underline"
        data-testid="link-importar-ia"
      >
        Importar planilha completa com a IA (cadastros com aprovação) →
      </Link>
      <h1 className="mb-2 text-2xl font-bold text-white">Importar dados</h1>
      <p className="mb-6 text-sm text-slate-400">
        Upload manual de planilhas (.xlsx, .xls, .csv) — usado enquanto a integração automática com
        Google Sheets não existe. Os dados entram pelas mesmas regras de validação dos formulários
        normais.
      </p>

      <section className="mb-8 rounded-xl border border-tms-cyan/30 bg-tms-cyan/5 p-5" data-testid="secao-importacao-ia">
        <h2 className="mb-1 text-lg font-semibold text-white">Importação inteligente (IA)</h2>
        <p className="mb-4 text-xs text-slate-400">
          Envie qualquer planilha da operação: a IA identifica o tipo de dado, mapeia as colunas e normaliza os valores.
          Você revisa e confirma antes de gravar.
        </p>
        <AiImportWizard />
      </section>

      <h2 className="mb-2 text-base font-semibold text-slate-200">Importação manual (mapeamento de colunas)</h2>
      <div className="mb-6 space-y-4 rounded-lg border border-slate-800 p-5">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-300">
            O que esta planilha representa? *
          </span>
          <select
            className="input"
            value={target}
            onChange={(e) => {
              const novo = e.target.value as ImportTarget;
              setTarget(novo);
              if (scan) selecionarAba(scan, melhorAba(scan, novo), novo);
            }}
          >
            {(Object.keys(TARGET_LABELS) as ImportTarget[]).map((t) => (
              <option key={t} value={t}>
                {TARGET_LABELS[t]}
              </option>
            ))}
          </select>
        </label>

        <div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
          >
            <UploadCloud className="h-4 w-4" /> Selecionar planilha
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = '';
            }}
          />
          {nomeArquivo && (
            <span className="ml-3 inline-flex items-center gap-2 text-sm text-slate-400">
              <FileSpreadsheet className="h-4 w-4" /> {nomeArquivo} ({linhasBrutas.length} linhas)
            </span>
          )}
        </div>

        {scan && (
          <label className="block" data-testid="manual-aba">
            <span className="mb-1 block text-sm font-medium text-slate-300">
              Aba da planilha ({scan.resumo.totalAbas} abas lidas, {abasComDados.length} com dados)
            </span>
            <select
              className="input"
              value={abaAtual}
              onChange={(e) => selecionarAba(scan, e.target.value, target)}
            >
              {abasComDados.map((a) => (
                <option key={a.nome} value={a.nome}>
                  {a.nome} — {a.linhas.length} linhas, {a.cabecalhos.length} colunas
                </option>
              ))}
            </select>
            {scan.abas.find((a) => a.nome === abaAtual)?.observacoes.map((o) => (
              <span key={o} className="mt-1 block text-xs text-slate-500">
                • {o}
              </span>
            ))}
          </label>
        )}
        {scan && abasComDados.length === 0 && (
          <p className="text-sm text-amber-300">Nenhuma aba com tabela de dados foi encontrada neste arquivo.</p>
        )}
      </div>

      {headers.length > 0 && (
        <>
          <section className="mb-6 rounded-lg border border-slate-800 p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-200">
              Mapeamento de colunas — planilha → sistema
            </h2>
            <div className="space-y-2">
              {campos.map((campo) => (
                <div key={campo.key} className="flex items-center gap-3">
                  <span className="w-48 shrink-0 text-sm text-slate-300">
                    {campo.label}
                    {campo.required && <span className="text-red-400"> *</span>}
                  </span>
                  <select
                    className="input flex-1"
                    value={mapeamento[campo.key] ?? ''}
                    onChange={(e) =>
                      setMapeamento((prev) => ({ ...prev, [campo.key]: e.target.value }))
                    }
                  >
                    <option value="">Não mapear</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-6 rounded-lg border border-slate-800 p-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-200">
              Pré-visualização (5 primeiras linhas)
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-slate-400">
                    {campos.map((c) => (
                      <th key={c.key} className="whitespace-nowrap px-2 py-1">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {linhasMapeadas.slice(0, 5).map((linha, i) => (
                    <tr key={i} className="border-t border-slate-800 text-slate-300">
                      {campos.map((c) => (
                        <td key={c.key} className="whitespace-nowrap px-2 py-1">
                          {String(linha[c.key] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="mb-6 flex flex-wrap gap-3">
            <button
              disabled={submitting}
              onClick={handleValidar}
              className="rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            >
              Validar
            </button>
            <button
              disabled={submitting || !validacao || validacao.linhasValidas === 0}
              onClick={handleImportar}
              className="rounded-md bg-rigabras-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
            >
              Importar {validacao ? `(${validacao.linhasValidas} registros novos)` : ''}
            </button>
          </div>

          {validacao && !resultadoImportacao && (
            <ResultadoValidacao
              totalLinhas={validacao.totalLinhas}
              linhasValidas={validacao.linhasValidas}
              linhasComErro={validacao.linhasComErro}
              erros={validacao.erros}
            />
          )}

          {resultadoImportacao && (
            <ResultadoValidacao
              totalLinhas={resultadoImportacao.dataset.total_linhas}
              linhasValidas={resultadoImportacao.dataset.linhas_importadas}
              linhasComErro={resultadoImportacao.dataset.linhas_com_erro}
              erros={resultadoImportacao.erros}
              importado
            />
          )}
        </>
      )}

      {error && <p className="mb-6 text-sm text-red-400">{error}</p>}

      {historico.length > 0 && (
        <section className="rounded-lg border border-slate-800 p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-200">Histórico de importações</h2>
          <div className="space-y-2">
            {historico.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between rounded-md bg-slate-900/60 px-3 py-2 text-sm text-slate-300"
              >
                <span>
                  {d.nome} — {TARGET_LABELS[d.target]}
                </span>
                <span className="text-xs text-slate-500">
                  {d.linhas_importadas}/{d.total_linhas} importadas ·{' '}
                  {d.created_at && new Date(d.created_at).toLocaleString('pt-BR')}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ResultadoValidacao({
  totalLinhas,
  linhasValidas,
  linhasComErro,
  erros,
  importado,
}: {
  totalLinhas: number;
  linhasValidas: number;
  linhasComErro: number;
  erros: Array<{ linha: number; campo?: string | null; mensagem: string }>;
  importado?: boolean;
}) {
  return (
    <div className="mb-6 rounded-lg border border-slate-800 p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
        {linhasComErro === 0 ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-amber-400" />
        )}
        {importado ? 'Resultado da importação' : 'Resultado da validação'}
      </div>
      <div className="mb-3 grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-xl font-bold text-white">{totalLinhas}</p>
          <p className="text-xs text-slate-400">linhas na planilha</p>
        </div>
        <div>
          <p className="text-xl font-bold text-emerald-400">{linhasValidas}</p>
          <p className="text-xs text-slate-400">{importado ? 'importadas' : 'válidas'}</p>
        </div>
        <div>
          <p className="text-xl font-bold text-red-400">{linhasComErro}</p>
          <p className="text-xs text-slate-400">com erro</p>
        </div>
      </div>
      {erros.length > 0 && (
        <div className="max-h-48 space-y-1 overflow-y-auto text-xs text-red-300">
          {erros.map((e, i) => (
            <p key={i}>
              {e.linha >= 0 ? `Linha ${e.linha}` : 'Registro'}
              {e.campo ? ` (${e.campo})` : ''}: {e.mensagem}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
