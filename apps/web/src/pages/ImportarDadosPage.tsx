import { useEffect, useMemo, useRef, useState } from 'react';
import { read, utils } from 'xlsx';
import { UploadCloud, FileSpreadsheet, CheckCircle2, AlertTriangle } from 'lucide-react';
import type { ImportTarget, ValidarImportacaoResult, ImportDataset } from '@rigabras/shared';
import { IMPORT_TARGET_FIELDS } from '@rigabras/shared';
import { useImportacaoActions } from '../hooks/useImportacao.js';

const TARGET_LABELS: Record<ImportTarget, string> = {
  viagens: 'Viagens (TMS / Gerenciamento de Risco)',
  manutencoes_veiculo: 'Manutenções de veículo (Frota)',
};

/** Normaliza um nome de coluna para sugestão automática de mapeamento (case/acentos/espaços). */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Importação de dados (Módulo 9) — ponte manual via Excel/CSV até a
 * integração com Google Sheets existir (documento de evolução, seções
 * 15-18): upload -> pré-visualização -> mapeamento de colunas -> validação
 * -> importação. Nunca apaga dados existentes; cada lote fica registrado
 * como um dataset auditável.
 */
export default function ImportarDadosPage() {
  const { validar, importar, listarHistorico, submitting, error } = useImportacaoActions();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [target, setTarget] = useState<ImportTarget>('viagens');
  const [nomeArquivo, setNomeArquivo] = useState('');
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
    setHeaders([]);
    setLinhasBrutas([]);
    setMapeamento({});
    setValidacao(null);
    setResultadoImportacao(null);
  }

  async function handleFile(file: File) {
    resetArquivo();
    setNomeArquivo(file.name);
    const buffer = await file.arrayBuffer();
    const workbook = read(buffer, { cellDates: true });
    const primeiraAba = workbook.Sheets[workbook.SheetNames[0]!];
    const linhas = utils.sheet_to_json<Record<string, unknown>>(primeiraAba!, { defval: '' });
    const cabecalhos = linhas.length > 0 ? Object.keys(linhas[0]!) : [];
    setHeaders(cabecalhos);
    setLinhasBrutas(linhas);

    // Sugestão automática: casa cada campo do sistema com a coluna cujo nome normalizado bate.
    const sugestao: Record<string, string> = {};
    for (const campo of campos) {
      const match = cabecalhos.find(
        (h) => normalizar(h) === normalizar(campo.key) || normalizar(h) === normalizar(campo.label),
      );
      if (match) sugestao[campo.key] = match;
    }
    setMapeamento(sugestao);
  }

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
      <h1 className="mb-2 text-2xl font-bold text-white">Importar dados</h1>
      <p className="mb-6 text-sm text-slate-400">
        Upload manual de planilhas (.xlsx, .xls, .csv) — usado enquanto a integração automática com
        Google Sheets não existe. Os dados entram pelas mesmas regras de validação dos formulários
        normais.
      </p>

      <div className="mb-6 space-y-4 rounded-lg border border-slate-800 p-5">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-300">
            O que esta planilha representa? *
          </span>
          <select
            className="input"
            value={target}
            onChange={(e) => {
              setTarget(e.target.value as ImportTarget);
              resetArquivo();
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
