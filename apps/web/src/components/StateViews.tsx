import { AlertTriangle, Inbox, Loader2, RefreshCw } from 'lucide-react';

export function LoadingSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Carregando">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-16 w-full animate-pulse rounded-xl bg-slate-100" />
      ))}
      <span className="sr-only">Carregando...</span>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-200 py-16 text-center">
      <Inbox className="h-10 w-10 text-slate-500" />
      <p className="text-lg font-medium text-slate-700">{title}</p>
      <p className="max-w-sm text-sm text-slate-500">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-2 rounded-xl bg-rigabras-500 px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-all duration-200"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50 py-12 text-center">
      <AlertTriangle className="h-8 w-8 text-red-600" />
      <p className="font-medium text-red-700">Não foi possível carregar os dados</p>
      <p className="max-w-sm text-sm text-red-600">{message}</p>
      <button
        onClick={onRetry}
        className="mt-2 inline-flex items-center gap-2 rounded-xl border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 transition-all duration-200"
      >
        <RefreshCw className="h-4 w-4" /> Tentar novamente
      </button>
    </div>
  );
}

export function Spinner({ label = 'Carregando...' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </span>
  );
}
