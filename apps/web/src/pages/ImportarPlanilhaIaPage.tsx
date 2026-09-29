import { useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  Loader2,
  MinusCircle,
  Sparkles,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import type { AnalisarAbaResult } from '@rigabras/shared';
import {
  MAX_LINHAS_POR_CHAMADA,
  TAMANHO_BLOCO,
  useImportacaoIa,
  type AbaExecucao,
  type StatusAba,
} from '../hooks/useImportacaoIa.js';

const SITUACAO_TEXTO: Record<AnalisarAbaResult['situacao'], string> = {
  processada: 'Processada',
  informativa: 'Informativa (nada a cadastrar)',
  nao_suportada: 'Reconhecida, ainda sem cadastro no sistema',
  desconhecida: 'Não reconhecida (a IA fez perguntas)',
};

const STATUS_TEXTO: Record<StatusAba, string> = {
  aguardando: 'Aguardando',
  enviando: 'Enviando...',
  ok: 'OK',
  erro: 'Erro',
  vazia: 'Vazia',
};

function StatusIcone({ status }: { status: StatusAba }) {
  switch (status) {
    case 'enviando':
      return <Loader2 className="h-4 w-4 animate-spin text-blue-600" aria-hidden="true" />;
    case 'ok':
      return <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />;
    case 'erro':
      return <XCircle className="h-4 w-4 text-red-600" aria-hidden="true" />;
    case 'vazia':
      return <MinusCircle className="h-4 w-4 text-slate-500" aria-hidden="true" />;
    default:
      return <Clock className="h-4 w-4 text-slate-500" aria-hidden="true" />;
  }
}

function plural(n: number, singular: string, pluralTxt: string): string {
  return `${n} ${n === 1 ? singular : pluralTxt}`;
}

/**
 * Importar planilha completa com IA: o navegador lê todas as abas e envia uma por
 * requisição. A IA nunca grava nas tabelas de negócio — gera solicitações para o
 * administrador aprovar em /solicitacoes-ia.
 */
export default function ImportarPlanilhaIaPage() {
  const {
    fase,
    nomeArquivo,
    abas,
    execucao,
    lendo,
    erroLeitura,
    erro,
    resumo,
    lerArquivo,
    analisar,
    reiniciar,
  } = useImportacaoIa();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const analisando = fase === 'analisando';
  const concluido = fase === 'concluido';

  const finalizadas = execucao.filter(
    (e) => e.status === 'ok' || e.status === 'erro' || e.status === 'vazia',
  ).length;
  const percentual = execucao.length > 0 ? Math.round((finalizadas / execucao.length) * 100) : 0;

  const resultados = execucao.flatMap((e) => (e.resultado ? [e.resultado] : []));
  const totais = resultados.reduce(
    (acc, r) => ({
      cadastros: acc.cadastros + r.cadastros,
      atualizacoes: acc.atualizacoes + r.atualizacoes,
      perguntas: acc.perguntas + r.perguntas,
      jaCadastrados: acc.jaCadastrados + r.jaCadastrados,
    }),
    { cadastros: 0, atualizacoes: 0, perguntas: 0, jaCadastrados: 0 },
  );
  const totalSolicitacoes = totais.cadastros + totais.atualizacoes + totais.perguntas;
  const pendentes = resumo?.pendentes ?? totalSolicitacoes;
  const abasComErro = execucao.filter((e) => e.status === 'erro').length;
  const abaPorNome = new Map(abas.map((a) => [a.nome, a]));

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <Link
        to="/importar-dados"
        className="mb-3 inline-block text-xs text-slate-500 hover:text-blue-600 hover:underline transition-all duration-200"
      >
        Importação manual (uma tabela, mapeando colunas) →
      </Link>
      <h1 className="mb-2 flex items-center gap-2 text-2xl font-bold text-slate-900">
        <Sparkles className="h-6 w-6 text-blue-600" aria-hidden="true" /> Importar planilha completa
        com IA
      </h1>
      <p className="mb-6 text-sm text-slate-500">
        Envie a planilha inteira, com todas as abas. A IA nunca grava sozinha: tudo vira solicitação
        para você aprovar; quando não souber o que um dado significa, ela pergunta.
      </p>

      {/* Passo 1: arquivo */}
      <section
        className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        aria-labelledby="passo-arquivo"
      >
        <h2 id="passo-arquivo" className="mb-3 text-sm font-bold text-slate-700">
          1. Escolha a planilha
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={lendo || analisando}
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition-all duration-200 bg-white shadow-sm"
          >
            <UploadCloud className="h-4 w-4" aria-hidden="true" />
            {nomeArquivo ? 'Trocar planilha' : 'Selecionar planilha'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            aria-label="Arquivo da planilha (.xlsx, .xls ou .csv)"
            data-testid="importar-ia-arquivo"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void lerArquivo(file);
              e.target.value = '';
            }}
          />
          {lendo && (
            <span className="inline-flex items-center gap-2 text-sm text-slate-500" role="status">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Lendo planilha...
            </span>
          )}
          {nomeArquivo && !lendo && (
            <span className="inline-flex min-w-0 items-center gap-2 text-sm text-slate-600">
              <FileSpreadsheet className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{nomeArquivo}</span>
            </span>
          )}
        </div>
        {erroLeitura && (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {erroLeitura}
          </p>
        )}
      </section>

      {/* Abas detectadas */}
      {abas.length > 0 && !concluido && (
        <section
          className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
          aria-labelledby="passo-abas"
        >
          <h2 id="passo-abas" className="mb-1 text-sm font-bold text-slate-700">
            2. Abas detectadas ({abas.length})
          </h2>
          <p className="mb-3 text-xs text-slate-500">
            Colunas com fórmula são calculadas: a IA as ignora, pois são derivadas de outras.
          </p>
          <ul className="divide-y divide-slate-200">
            {abas.map((aba) => {
              const exec = execucao.find((e) => e.nome === aba.nome);
              return (
                <li key={aba.nome} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <span className="min-w-0 break-words text-sm font-medium text-slate-700">
                      {aba.nome}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-slate-500">
                      {exec ? (
                        <>
                          <StatusIcone status={exec.status} />
                          <span>{STATUS_TEXTO[exec.status]}</span>
                        </>
                      ) : aba.linhas.length === 0 ? (
                        <span className="text-slate-500">Vazia (não será enviada)</span>
                      ) : null}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {plural(aba.totalLinhas, 'linha', 'linhas')} ·{' '}
                    {plural(aba.cabecalhos.length, 'coluna', 'colunas')}
                    {aba.colunasCalculadas.length > 0 && (
                      <span className="text-amber-700">
                        {' '}
                        ·{' '}
                        {plural(
                          aba.colunasCalculadas.length,
                          'coluna calculada',
                          'colunas calculadas',
                        )}{' '}
                        (a IA ignora, são derivadas)
                      </span>
                    )}
                  </p>
                  {aba.linhas.length > MAX_LINHAS_POR_CHAMADA && (
                    <p className="text-xs text-slate-500">
                      Aba grande: será enviada em blocos de {TAMANHO_BLOCO} linhas.
                    </p>
                  )}
                  {aba.avisos.map((a) => (
                    <p key={a} className="flex items-start gap-1 text-xs text-amber-700">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" /> {a}
                    </p>
                  ))}
                  {exec?.status === 'erro' && (
                    <p className="mt-1 text-xs text-red-700" role="alert">
                      {exec.erro}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>

          {analisando && (
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-xs text-slate-500">
                <span>Analisando abas...</span>
                <span>
                  {finalizadas}/{execucao.length}
                </span>
              </div>
              <div
                className="h-2 overflow-hidden rounded-full bg-slate-100"
                role="progressbar"
                aria-label="Progresso da análise"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percentual}
              >
                <div
                  className="h-full rounded-full bg-blue-600 transition-all"
                  style={{ width: `${percentual}%` }}
                />
              </div>
            </div>
          )}

          {fase === 'lido' && (
            <div className="mt-5">
              <button
                type="button"
                onClick={() => void analisar()}
                disabled={abas.every((a) => a.linhas.length === 0)}
                data-testid="importar-ia-iniciar"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 sm:w-auto transition-all duration-200"
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" /> Analisar com a IA
              </button>
            </div>
          )}
        </section>
      )}

      {erro && (
        <p
          className="mb-6 rounded-xl border border-red-200 bg-red-500/10 p-3 text-sm text-red-700"
          role="alert"
        >
          {erro}
        </p>
      )}

      {/* Resumo */}
      {concluido && (
        <section
          className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
          aria-labelledby="passo-resumo"
          data-testid="importar-ia-resumo"
        >
          <h2
            id="passo-resumo"
            className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700"
          >
            {abasComErro === 0 ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
            )}
            Análise concluída
          </h2>

          <div className="mb-4 grid grid-cols-2 gap-4 text-center sm:grid-cols-4">
            <Totalizador
              valor={totais.cadastros}
              rotulo="cadastros propostos"
              cor="text-emerald-600"
            />
            <Totalizador
              valor={totais.atualizacoes}
              rotulo="atualizações propostas"
              cor="text-blue-600"
            />
            <Totalizador valor={totais.perguntas} rotulo="perguntas da IA" cor="text-amber-700" />
            <Totalizador
              valor={totais.jaCadastrados}
              rotulo="já cadastrados"
              cor="text-slate-600"
            />
          </div>

          {abasComErro > 0 && (
            <p className="mb-4 text-sm text-amber-700" role="alert">
              {plural(abasComErro, 'aba falhou', 'abas falharam')} e não gerou solicitações. As
              demais foram analisadas normalmente.
            </p>
          )}

          <ul className="mb-5 space-y-3">
            {execucao.map((e) => (
              <ResultadoAba
                key={e.nome}
                exec={e}
                totalLinhas={abaPorNome.get(e.nome)?.totalLinhas}
              />
            ))}
          </ul>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              to="/solicitacoes-ia"
              data-testid="importar-ia-revisar"
              className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-4 text-base font-semibold text-white hover:opacity-90 transition-all duration-200"
            >
              Revisar {plural(pendentes, 'solicitação', 'solicitações')} da IA
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </Link>
            <button
              type="button"
              onClick={reiniciar}
              className="rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700 hover:bg-slate-100 transition-all duration-200 bg-white shadow-sm"
            >
              Importar outra planilha
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Nada foi gravado ainda: os cadastros só entram depois que você aprovar as solicitações.
          </p>
        </section>
      )}
    </div>
  );
}

function Totalizador({ valor, rotulo, cor }: { valor: number; rotulo: string; cor: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-3">
      <p className={`text-2xl font-bold ${cor}`}>{valor}</p>
      <p className="text-xs text-slate-500">{rotulo}</p>
    </div>
  );
}

function ResultadoAba({ exec, totalLinhas }: { exec: AbaExecucao; totalLinhas?: number }) {
  const r = exec.resultado;
  return (
    <li className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-700">
          <StatusIcone status={exec.status} />
          <span className="break-words">{exec.nome}</span>
        </span>
        <span className="text-xs text-slate-500">
          {r ? SITUACAO_TEXTO[r.situacao] : STATUS_TEXTO[exec.status]}
        </span>
      </div>

      {exec.status === 'erro' && <p className="mt-1 text-xs text-red-700">{exec.erro}</p>}
      {exec.status === 'vazia' && (
        <p className="mt-1 text-xs text-slate-500">Aba sem dados: não foi enviada.</p>
      )}

      {r && (
        <>
          <p className="mt-1 text-xs text-slate-500">
            {plural(r.linhasLidas || totalLinhas || 0, 'linha lida', 'linhas lidas')}
            {r.entidade ? ` · ${r.entidade}` : ''} · {r.cadastros} cadastros · {r.atualizacoes}{' '}
            atualizações · {r.perguntas} perguntas · {r.jaCadastrados} já cadastrados
          </p>
          {r.colunasCalculadas.length > 0 && (
            <p className="mt-1 text-xs text-slate-500">
              Colunas calculadas ignoradas (derivadas): {r.colunasCalculadas.join(', ')}
            </p>
          )}
          {r.avisos.map((a) => (
            <p key={a} className="mt-1 flex items-start gap-1 text-xs text-amber-700">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" /> {a}
            </p>
          ))}
        </>
      )}
    </li>
  );
}
