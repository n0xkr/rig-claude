import { useState } from 'react';
import { ShieldCheck, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuditoriaList } from '../hooks/useAuditoria.js';
import { LoadingSkeleton, ErrorCard, EmptyState } from '../components/StateViews.js';

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Criação',
  UPDATE: 'Atualização',
  DELETE: 'Exclusão',
  STATUS_CHANGE: 'Mudança de status',
};

const ACTION_STYLES: Record<string, string> = {
  CREATE: 'bg-emerald-50 text-emerald-700',
  UPDATE: 'bg-cyan-50 text-cyan-700',
  DELETE: 'bg-red-50 text-red-700',
  STATUS_CHANGE: 'bg-amber-50 text-amber-700',
};

/** Trilha de auditoria (critério #21): quem fez o quê, quando, e o antes/depois — acesso restrito a ADMIN/SUPERADMIN. */
export default function AuditoriaListPage() {
  const [entityFiltro, setEntityFiltro] = useState('');
  const { state, logs, error, hasMore, loadMore, reload } = useAuditoriaList(
    entityFiltro || undefined,
  );
  const [expandido, setExpandido] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex items-center gap-2">
        <ShieldCheck className="h-6 w-6 text-rigabras-500" />
        <h1 className="text-2xl font-bold text-slate-900">Auditoria</h1>
      </div>

      <div className="mb-6">
        <input
          className="input max-w-xs"
          placeholder="Filtrar por entidade (ex: viagens, fretes)"
          value={entityFiltro}
          onChange={(e) => setEntityFiltro(e.target.value)}
        />
      </div>

      {state === 'loading' && logs.length === 0 ? (
        <LoadingSkeleton />
      ) : state === 'error' ? (
        <ErrorCard message={error ?? 'Erro'} onRetry={reload} />
      ) : logs.length === 0 ? (
        <EmptyState
          title="Nenhum registro de auditoria"
          description="Ainda não há ações registradas para este filtro."
        />
      ) : (
        <div className="space-y-2">
          {logs.map((log) => {
            const aberto = expandido === log.id;
            return (
              <div
                key={log.id}
                className="rounded-xl border border-slate-200 p-3 bg-white shadow-sm"
              >
                <button
                  className="flex w-full items-center justify-between gap-2 text-left"
                  onClick={() => setExpandido(aberto ? null : log.id)}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ACTION_STYLES[log.action] ?? 'bg-slate-200 text-slate-700'}`}
                    >
                      {ACTION_LABELS[log.action] ?? log.action}
                    </span>
                    <span className="text-sm text-slate-700">
                      {log.user?.nome_completo ?? 'Sistema'}{' '}
                      <span className="text-slate-500">
                        alterou <span className="font-mono">{log.entity}</span>
                        {log.entity_id ? ` (${log.entity_id.slice(0, 8)})` : ''}
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">
                      {log.created_at && new Date(log.created_at).toLocaleString('pt-BR')}
                    </span>
                    {aberto ? (
                      <ChevronUp className="h-4 w-4 text-slate-500" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-500" />
                    )}
                  </div>
                </button>
                {aberto && log.changes_json && (
                  <pre className="mt-3 max-h-64 overflow-auto rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                    {JSON.stringify(log.changes_json, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
          {hasMore && (
            <button
              onClick={loadMore}
              className="w-full rounded-xl border border-slate-200 py-2 text-sm text-slate-600 hover:bg-slate-100 transition-all duration-200 bg-white shadow-sm"
            >
              Carregar mais
            </button>
          )}
        </div>
      )}
    </div>
  );
}
