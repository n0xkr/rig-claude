import { AlertTriangle, Inbox, Loader2, RefreshCw } from "lucide-react";

export function LoadingSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Carregando">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-16 w-full animate-pulse rounded-lg bg-slate-800/60" />
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
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-700 py-16 text-center">
      <Inbox className="h-10 w-10 text-slate-500" />
      <p className="text-lg font-medium text-slate-200">{title}</p>
      <p className="max-w-sm text-sm text-slate-400">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-2 rounded-md bg-rigabras-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-red-900/50 bg-red-950/30 py-12 text-center">
      <AlertTriangle className="h-8 w-8 text-red-400" />
      <p className="font-medium text-red-200">Não foi possível carregar os dados</p>
      <p className="max-w-sm text-sm text-red-300/80">{message}</p>
      <button
        onClick={onRetry}
        className="mt-2 inline-flex items-center gap-2 rounded-md border border-red-700 px-4 py-2 text-sm font-medium text-red-200 hover:bg-red-900/40"
      >
        <RefreshCw className="h-4 w-4" /> Tentar novamente
      </button>
    </div>
  );
}

export function Spinner({ label = "Carregando..." }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-slate-400">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </span>
  );
}
