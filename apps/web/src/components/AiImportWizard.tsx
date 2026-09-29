import { useRef, useState } from 'react';
import {
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Search,
  Sparkles,
  UploadCloud,
  AlertTriangle,
} from 'lucide-react';
import type {
  AbaEscaneada,
  AnalisarPlanilhaResult,
  CommitImportacaoResult,
  ImportTarget,
  PlanilhaEscaneada,
  ValidarImportacaoResult,
} from '@rigabras/shared';
import {
  IMPORT_TARGET_FIELDS,
  buscarNaPlanilha,
  sugerirAlvo,
  sugerirAlvoTolerante,
} from '@rigabras/shared';
import { lerPlanilhaCompleta } from '../lib/lerPlanilha.js';
import { api } from '../lib/apiClient.js';
import { errorMessage } from '../hooks/useAcompanhamento.js';
import { haptic } from '../lib/haptics.js';

const TARGET_LABELS: Record<ImportTarget, string> = {
  veiculos: 'Veículos / acompanhamento da frota',
  viagens: 'Viagens (TMS)',
  manutencoes_veiculo: 'Manutenções de veículo',
};

type Row = Record<string, unknown>;

interface SheetState {
  nome: string;
  aba: AbaEscaneada;
  headers: string[];
  rows: Row[];
  analise: AnalisarPlanilhaResult | null;
  /** null = aba de referência (não importada, a menos que o usuário escolha um destino). */
  target: ImportTarget | null;
  mapeamento: Record<string, string | null>;
  valueMaps: Record<string, Record<string, string>>;
  validacao: ValidarImportacaoResult | null;
  resultado: CommitImportacaoResult | null;
  status: 'aguardando' | 'analisando' | 'pronto' | 'validando' | 'importando' | 'erro';
  erro?: string;
}

const TIPO_ABA_LABEL: Record<AbaEscaneada['tipo'], string> = {
  TABELA: 'Tabela',
  CHAVE_VALOR: 'Indicadores',
  TEXTO: 'Texto',
  VAZIA: 'Vazia',
};

/** Aplica o mapeamento coluna→campo e a normalização de valores (valueMaps) às linhas brutas. */
function mapearLinhas(s: SheetState): Row[] {
  return s.rows.map((linha) => {
    const out: Row = {};
    for (const [coluna, campo] of Object.entries(s.mapeamento)) {
      if (!campo) continue;
      let v = linha[coluna];
      const mapa = s.valueMaps[campo];
      if (mapa && typeof v === 'string' && mapa[v.trim()]) v = mapa[v.trim()];
      out[campo] = v;
    }
    return out;
  });
}

/**
 * Importação inteligente: a IA lê cabeçalhos + amostra de cada aba, decide o
 * destino (veículos/viagens/manutenções), mapeia as colunas e normaliza
 * valores; o usuário revisa/ajusta, valida e importa. Reimportar a mesma
 * placa ATUALIZA o veículo (acompanhamento), nunca duplica.
 */
export function AiImportWizard({ onImported }: { onImported?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState('');
  const [scan, setScan] = useState<PlanilhaEscaneada | null>(null);
  const [abas, setAbas] = useState<SheetState[]>([]);
  const [lendo, setLendo] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [criarVeiculos, setCriarVeiculos] = useState(true);
  const [busca, setBusca] = useState('');

  const patch = (i: number, p: Partial<SheetState>) =>
    setAbas((prev) => prev.map((a, idx) => (idx === i ? { ...a, ...p } : a)));

  /** IA recebe perfil de TODAS as linhas da aba + resumo das outras abas; amostra curta para caber no prompt. */
  async function analisar(
    i: number,
    aba: SheetState,
    planilha: PlanilhaEscaneada,
    alvo?: ImportTarget,
  ) {
    patch(i, { status: 'analisando', erro: undefined });
    try {
      const analise = await api.post<AnalisarPlanilhaResult>('/importacoes/ia/analisar', {
        nome: `${arquivo} / ${aba.nome}`,
        alvo,
        cabecalhos: aba.headers,
        amostra: aba.rows.slice(0, 10).map(({ __linha, ...resto }) => resto),
        perfil: aba.aba.colunas
          .filter((c) => c.tipo !== 'vazio')
          .map(({ nome, tipo, preenchimento, distintos, exemplos, valoresDistintos }) => ({
            nome,
            tipo,
            preenchimento: Math.round(preenchimento * 100) / 100,
            distintos,
            exemplos,
            valoresDistintos,
          })),
        outrasAbas: planilha.abas
          .filter((o) => o.nome !== aba.nome)
          .map((o) => ({
            aba: o.nome,
            tipo: o.tipo,
            linhas: o.linhas.length,
            colunas: o.cabecalhos.slice(0, 30),
          })),
      });
      patch(i, {
        analise,
        target: analise.target,
        mapeamento: analise.mapeamento,
        valueMaps: analise.valueMaps,
        status: 'pronto',
      });
    } catch (err) {
      patch(i, { status: 'erro', erro: errorMessage(err) });
    }
  }

  async function handleFile(file: File) {
    setErroGeral(null);
    setAbas([]);
    setScan(null);
    setBusca('');
    setArquivo(file.name);
    setLendo(true);
    try {
      const planilha = await lerPlanilhaCompleta(file);
      setScan(planilha);
      const tabelas = planilha.abas.filter((a) => a.tipo === 'TABELA' && a.linhas.length > 0);
      if (tabelas.length === 0) {
        setErroGeral('Nenhuma aba com tabela de dados foi encontrada na planilha.');
        return;
      }
      const iniciais: SheetState[] = tabelas.map((a) => {
        const sugerido =
          sugerirAlvo(a.cabecalhos, a.nome) ??
          (tabelas.length === 1 ? sugerirAlvoTolerante(a.cabecalhos) : null);
        return {
          nome: a.nome,
          aba: a,
          headers: a.cabecalhos,
          rows: a.linhas,
          analise: null,
          target: sugerido?.target ?? null,
          mapeamento: {},
          valueMaps: {},
          validacao: null,
          resultado: null,
          status: sugerido ? 'analisando' : 'aguardando',
        };
      });
      setAbas(iniciais);
      // Só as abas com destino provável passam pela IA; cadastros auxiliares ficam como referência.
      await Promise.all(iniciais.map((a, i) => (a.target ? analisar(i, a, planilha) : undefined)));
    } catch {
      setErroGeral('Não foi possível ler o arquivo. Use .xlsx, .xls ou .csv válidos.');
    } finally {
      setLendo(false);
    }
  }

  /** Usuário escolhe manualmente o destino de uma aba de referência (ou troca o da IA). */
  function trocarAlvo(i: number, aba: SheetState, target: ImportTarget) {
    if (!aba.analise && scan) {
      patch(i, { target });
      void analisar(i, { ...aba, target }, scan, target);
      return;
    }
    const validos = new Set(IMPORT_TARGET_FIELDS[target].map((c) => c.key));
    const mapeamento = Object.fromEntries(
      Object.entries(aba.mapeamento).map(([col, campo]) => [
        col,
        campo && validos.has(campo) ? campo : null,
      ]),
    );
    patch(i, { target, mapeamento, validacao: null, resultado: null });
  }

  async function validar(i: number, aba: SheetState) {
    if (!aba.target) return;
    patch(i, { status: 'validando', erro: undefined });
    try {
      const validacao = await api.post<ValidarImportacaoResult>('/importacoes/validar', {
        target: aba.target,
        linhas: mapearLinhas(aba),
        criarVeiculosAusentes: aba.target === 'viagens' ? criarVeiculos : undefined,
      });
      patch(i, { validacao, status: 'pronto' });
    } catch (err) {
      patch(i, { status: 'erro', erro: errorMessage(err) });
    }
  }

  async function importar(i: number, aba: SheetState) {
    if (!aba.target) return;
    patch(i, { status: 'importando', erro: undefined });
    try {
      const resultado = await api.post<CommitImportacaoResult>('/importacoes', {
        target: aba.target,
        nome: `[IA] ${arquivo} / ${aba.nome}`,
        origem: /\.csv$/i.test(arquivo) ? 'CSV' : 'EXCEL',
        linhas: mapearLinhas(aba),
        criarVeiculosAusentes: aba.target === 'viagens' ? criarVeiculos : undefined,
      });
      patch(i, { resultado, status: 'pronto' });
      haptic(resultado.dataset.linhas_com_erro === 0 ? 'success' : 'warning');
      onImported?.();
    } catch (err) {
      patch(i, { status: 'erro', erro: errorMessage(err) });
    }
  }

  return (
    <div className="space-y-4" data-testid="ai-import">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) void handleFile(f);
        }}
        className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-blue-200 bg-blue-50 px-4 py-8 text-center"
        onClick={() => inputRef.current?.click()}
      >
        {lendo ? (
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        ) : (
          <UploadCloud className="h-8 w-8 text-blue-600" />
        )}
        <p className="text-sm font-medium text-slate-900">
          {arquivo ? arquivo : 'Arraste a planilha aqui ou clique para escolher'}
        </p>
        <p className="text-xs text-slate-500">
          .xlsx, .xls ou .csv — a IA descobre o tipo de dado e mapeia as colunas sozinha
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          data-testid="ai-import-file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = '';
          }}
        />
      </div>

      {erroGeral && <p className="text-sm text-red-600">{erroGeral}</p>}

      {scan && <PainelPlanilha scan={scan} abas={abas} busca={busca} onBusca={setBusca} />}

      {abas.some((a) => a.target === 'viagens') && (
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={criarVeiculos}
            onChange={(e) => setCriarVeiculos(e.target.checked)}
          />
          Cadastrar automaticamente veículos (placas) que ainda não existem
        </label>
      )}

      {abas.map((aba, i) => {
        const campos = aba.target ? IMPORT_TARGET_FIELDS[aba.target] : [];
        const ocupado =
          aba.status === 'analisando' || aba.status === 'validando' || aba.status === 'importando';
        const amostraPrimeira = aba.rows[0] ?? {};
        return (
          <div
            key={aba.nome}
            className="rounded-xl border border-slate-200 bg-white p-6"
            data-testid="ai-import-aba"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <FileSpreadsheet className="h-4 w-4 text-blue-600" /> {aba.nome}
                <span className="text-xs font-normal text-slate-500">
                  {aba.rows.length} linhas · {aba.headers.length} colunas
                  {aba.aba.linhaCabecalho && aba.aba.linhaCabecalho > 1
                    ? ` · cabeçalho na linha ${aba.aba.linhaCabecalho}`
                    : ''}
                </span>
              </div>
              {aba.analise && (
                <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-600">
                  <Sparkles className="h-3 w-3" />
                  {aba.analise.origem === 'IA' ? 'IA' : 'Automático'} · confiança{' '}
                  {Math.round(aba.analise.confianca * 100)}%
                </span>
              )}
            </div>

            {aba.status === 'aguardando' && !aba.analise && (
              <div className="text-xs text-slate-500">
                <p className="mb-2">
                  Aba de referência — não parece uma tabela de veículos, viagens ou manutenções,
                  então não será importada. Se quiser importá-la mesmo assim, escolha o destino:
                </p>
                <select
                  className="input text-xs"
                  value=""
                  onChange={(e) =>
                    e.target.value && trocarAlvo(i, aba, e.target.value as ImportTarget)
                  }
                  data-testid="ai-import-target-manual"
                >
                  <option value="">Não importar</option>
                  {(Object.keys(TARGET_LABELS) as ImportTarget[]).map((t) => (
                    <option key={t} value={t}>
                      Importar como: {TARGET_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {aba.status === 'analisando' && (
              <p className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> A IA está interpretando a
                planilha...
              </p>
            )}

            {aba.analise && (
              <>
                {aba.analise.observacoes.map((o, k) => (
                  <p key={k} className="mb-1 text-xs text-slate-500">
                    • {o}
                  </p>
                ))}

                <label className="mb-3 mt-2 block text-xs text-slate-500">
                  Destino dos dados
                  <select
                    className="input mt-1"
                    value={aba.target ?? ''}
                    onChange={(e) => trocarAlvo(i, aba, e.target.value as ImportTarget)}
                    data-testid="ai-import-target"
                  >
                    {(Object.keys(TARGET_LABELS) as ImportTarget[]).map((t) => (
                      <option key={t} value={t}>
                        {TARGET_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="max-h-96 overflow-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-slate-50 text-slate-500">
                      <tr>
                        <th className="pb-1 pr-3">Coluna da planilha</th>
                        <th className="pb-1 pr-3">Exemplo</th>
                        <th className="pb-1">Campo do sistema</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aba.headers.map((h) => (
                        <tr key={h} className="border-t border-slate-200">
                          <td className="py-1.5 pr-3 text-slate-700">{h}</td>
                          <td className="max-w-[10rem] truncate py-1.5 pr-3 text-slate-500">
                            {String(amostraPrimeira[h] ?? '')}
                          </td>
                          <td className="py-1.5">
                            <select
                              className="input py-1 text-xs"
                              value={aba.mapeamento[h] ?? ''}
                              onChange={(e) =>
                                patch(i, {
                                  mapeamento: { ...aba.mapeamento, [h]: e.target.value || null },
                                  validacao: null,
                                })
                              }
                            >
                              <option value="">— ignorar —</option>
                              {campos.map((c) => (
                                <option key={c.key} value={c.key}>
                                  {c.label}
                                  {c.required ? ' *' : ''}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => void validar(i, aba)}
                    className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-all duration-200 bg-white shadow-sm"
                    data-testid="ai-import-validar"
                  >
                    {aba.status === 'validando' ? 'Validando...' : 'Validar'}
                  </button>
                  <button
                    type="button"
                    disabled={ocupado || !!aba.resultado}
                    onClick={() => void importar(i, aba)}
                    className="btn-brand !px-3 !py-1.5 !text-xs"
                    data-testid="ai-import-importar"
                  >
                    {aba.status === 'importando'
                      ? 'Importando...'
                      : `Importar ${aba.rows.length} linhas`}
                  </button>
                </div>

                {aba.validacao && !aba.resultado && (
                  <p className="mt-2 text-xs text-slate-600">
                    {aba.validacao.linhasValidas} válidas · {aba.validacao.linhasComErro} com erro
                    {aba.validacao.erros.slice(0, 5).map((e, k) => (
                      <span key={k} className="block text-amber-700">
                        Linha {e.linha}: {e.campo ? `${e.campo} — ` : ''}
                        {e.mensagem}
                      </span>
                    ))}
                  </p>
                )}

                {aba.resultado && (
                  <div className="mt-2 text-xs" data-testid="ai-import-resultado">
                    <p className="flex items-center gap-1 text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" /> {aba.resultado.dataset.linhas_importadas}{' '}
                      de {aba.resultado.dataset.total_linhas} linhas importadas
                    </p>
                    {aba.resultado.erros.slice(0, 8).map((e, k) => (
                      <p key={k} className="flex items-start gap-1 text-amber-700">
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> Linha {e.linha}:{' '}
                        {e.mensagem}
                      </p>
                    ))}
                  </div>
                )}
              </>
            )}

            {aba.erro && <p className="mt-2 text-xs text-red-600">{aba.erro}</p>}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Visão de TUDO que foi lido do arquivo: cada aba (inclusive as que não viram importação),
 * onde está o cabeçalho, quantas linhas/colunas reais e o que ela é. Mais uma busca por
 * termo em nomes de aba, colunas e valores de todas as abas.
 */
function PainelPlanilha({
  scan,
  abas,
  busca,
  onBusca,
}: {
  scan: PlanilhaEscaneada;
  abas: SheetState[];
  busca: string;
  onBusca: (v: string) => void;
}) {
  const achados = busca.trim().length >= 2 ? buscarNaPlanilha(scan, busca, 30) : [];
  const alvoDaAba = (nome: string) => abas.find((a) => a.nome === nome)?.target ?? null;
  return (
    <div
      className="rounded-xl border border-slate-200 bg-white p-6"
      data-testid="ai-import-varredura"
    >
      <p className="mb-1 text-sm font-semibold text-slate-900">Varredura completa da planilha</p>
      <p className="mb-3 text-xs text-slate-500">
        {scan.resumo.totalAbas} abas lidas · {scan.resumo.tabelas} tabelas ·{' '}
        {scan.resumo.totalLinhas} linhas de dados · {scan.resumo.totalColunas} colunas. Só as abas
        com destino no sistema são importadas.
      </p>
      <div className="max-h-64 overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-slate-50 text-slate-500">
            <tr>
              <th className="pb-1 pr-3">Aba</th>
              <th className="pb-1 pr-3">Tipo</th>
              <th className="pb-1 pr-3 text-right">Linhas</th>
              <th className="pb-1 pr-3 text-right">Colunas</th>
              <th className="pb-1">Destino</th>
            </tr>
          </thead>
          <tbody>
            {scan.abas.map((a) => {
              const alvo = alvoDaAba(a.nome);
              return (
                <tr
                  key={a.nome}
                  className="border-t border-slate-200"
                  title={a.observacoes.join(' ')}
                >
                  <td className="py-1 pr-3 text-slate-700">
                    {a.nome}
                    {a.oculta && <span className="ml-1 text-slate-500">(oculta)</span>}
                  </td>
                  <td className="py-1 pr-3 text-slate-500">{TIPO_ABA_LABEL[a.tipo]}</td>
                  <td className="py-1 pr-3 text-right text-slate-500">{a.linhas.length || '—'}</td>
                  <td className="py-1 pr-3 text-right text-slate-500">
                    {a.cabecalhos.length || '—'}
                  </td>
                  <td className={alvo ? 'py-1 text-blue-600' : 'py-1 text-slate-500'}>
                    {alvo ? TARGET_LABELS[alvo] : 'referência'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <label className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 px-2 py-1.5 text-xs text-slate-600 bg-white shadow-sm">
        <Search className="h-3.5 w-3.5 text-slate-500" />
        <input
          value={busca}
          onChange={(e) => onBusca(e.target.value)}
          placeholder="Buscar em todas as abas (coluna, placa, cliente...)"
          className="w-full bg-transparent outline-none placeholder:text-slate-400"
          data-testid="ai-import-busca"
        />
      </label>
      {busca.trim().length >= 2 && (
        <div
          className="mt-2 max-h-40 space-y-0.5 overflow-auto text-[11px] text-slate-500"
          data-testid="ai-import-busca-resultado"
        >
          {achados.length === 0 && <p>Nada encontrado.</p>}
          {achados.map((x, k) => (
            <p key={k}>
              <span className="text-blue-600">{x.aba}</span>
              {x.linha ? ` · linha ${x.linha}` : ''} · {x.onde}
              {x.coluna && x.onde !== 'coluna' ? ` "${x.coluna}"` : ''}:{' '}
              <span className="text-slate-700">{x.valor}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
