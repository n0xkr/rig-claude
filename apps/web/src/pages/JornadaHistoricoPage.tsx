import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, History, Download } from 'lucide-react';
import { useJornadaHistorico } from '../hooks/useJornadaHistorico.js';
import { LoadingSkeleton, ErrorCard, EmptyState } from '../components/StateViews.js';
import { AchadoList } from '../components/AchadoList.js';

/**
 * Histórico consolidado de jornada de um motorista (Módulo 4, critério
 * "geração de histórico consolidado para reduzir a exposição trabalhista da
 * empresa"): sessões (INICIO_JORNADA -> FIM_JORNADA), tempos computados
 * (direção/espera/descanso) e achados de conformidade ADI 5322 por sessão —
 * exportável em CSV para uso como evidência.
 */
export default function JornadaHistoricoPage() {
  const { motoristaId } = useParams<{ motoristaId: string }>();
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const { state, historico, error, reload, exportarCsv } = useJornadaHistorico(motoristaId, {
    periodStart: periodStart || undefined,
    periodEnd: periodEnd || undefined,
  });
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      await exportarCsv();
    } catch {
      setExportError('Falha ao exportar o histórico em CSV.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link
        to="/jornada"
        className="mb-4 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para registro de jornada
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <History className="h-6 w-6 text-purple-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">
              Histórico de jornada {historico ? `— ${historico.motorista_nome}` : ''}
            </h1>
            <p className="text-sm text-slate-400">
              Consolidado de sessões e achados de conformidade ADI 5322.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={periodStart}
            onChange={(e) => setPeriodStart(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
          />
          <span className="text-slate-500">até</span>
          <input
            type="date"
            value={periodEnd}
            onChange={(e) => setPeriodEnd(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
          />
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:text-white disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> {exporting ? 'Exportando...' : 'Exportar CSV'}
          </button>
        </div>
      </div>

      {exportError && <p className="mb-4 text-sm text-red-400">{exportError}</p>}

      {state === 'loading' && <LoadingSkeleton rows={3} />}
      {state === 'error' && <ErrorCard message={error ?? 'Erro'} onRetry={reload} />}

      {state === 'success' && historico && historico.sessoes.length === 0 && (
        <EmptyState
          title="Nenhuma sessão de jornada"
          description="Nenhum evento de jornada foi registrado para este motorista no período selecionado."
        />
      )}

      {state === 'success' && historico && historico.sessoes.length > 0 && (
        <ul className="space-y-4">
          {[...historico.sessoes].reverse().map((sessao, idx) => (
            <li key={idx} className="rounded-lg border border-slate-800 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-slate-100">
                  {sessao.inicio_jornada
                    ? new Date(sessao.inicio_jornada).toLocaleString('pt-BR')
                    : '-'}
                  {' → '}
                  {sessao.fim_jornada
                    ? new Date(sessao.fim_jornada).toLocaleString('pt-BR')
                    : 'em andamento'}
                </span>
                {sessao.aberta && (
                  <span className="rounded-full bg-blue-900/60 px-2 py-0.5 text-xs font-semibold text-blue-200">
                    Em andamento
                  </span>
                )}
              </div>
              <dl className="mb-3 grid grid-cols-2 gap-2 text-sm text-slate-400 sm:grid-cols-4">
                <Info
                  label="Jornada total"
                  value={
                    sessao.tempo_jornada_minutos != null
                      ? `${sessao.tempo_jornada_minutos} min`
                      : '-'
                  }
                />
                <Info label="Direção" value={`${sessao.tempo_direcao_minutos} min`} />
                <Info label="Espera" value={`${sessao.tempo_espera_minutos} min`} />
                <Info label="Descanso" value={`${sessao.tempo_descanso_minutos} min`} />
              </dl>
              <AchadoList achados={sessao.achados} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-200">{value}</dd>
    </div>
  );
}
