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
  CREATE: 'bg-emerald-900/60 text-emerald-200',
  UPDATE: 'bg-cyan-900/60 text-cyan-200',
  DELETE: 'bg-red-900/60 text-red-200',
  STATUS_CHANGE: 'bg-amber-900/60 text-amber-200',
};

/** Trilha de auditoria (critério #21): quem fez o quê, quando, e o antes/depois — acesso restrito a ADMIN/SUPERADMIN. */
export default function AuditoriaListPage() {
  const [entityFiltro, setEntityFiltro] = useState('');
  const { state, logs, error, hasMore, loadMore, reload } = useAuditoriaList(entityFiltro || undefined);
  const [expandido, setExpandido] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-center gap-2">
        <ShieldCheck className="h-6 w-6 text-rigabras-500" />
        <h1 className="text-2xl font-bold text-white">Auditoria</h1>
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
        <EmptyState title="Nenhum registro de auditoria" description="Ainda não há ações registradas para este filtro." />
      ) : (
        <div className="space-y-2">
          {logs.map((log) => {
            const aberto = expandido === log.id;
            return (
              <div key={log.id} className="rounded-lg border border-slate-800 p-3">
                <button
                  className="flex w-full items-center justify-between gap-2 text-left"
                  onClick={() => setExpandido(aberto ? null : log.id)}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ACTION_STYLES[log.action] ?? 'bg-slate-700 text-slate-200'}`}
                    >
                      {ACTION_LABELS[log.action] ?? log.action}
                    </span>
                    <span className="text-sm text-slate-200">
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
                  <pre className="mt-3 max-h-64 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-400">
                    {JSON.stringify(log.changes_json, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}
          {hasMore && (
            <button
              onClick={loadMore}
              className="w-full rounded-md border border-slate-700 py-2 text-sm text-slate-300 hover:bg-slate-800"
            >
              Carregar mais
            </button>
          )}
        </div>
      )}
    </div>
  );
}
