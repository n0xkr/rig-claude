import type { StatusViagem, SeveridadeRisco } from "@rigabras/shared";

const STATUS_STYLES: Record<StatusViagem, string> = {
  PROGRAMADA: "bg-slate-700 text-slate-200",
  EM_COLETA: "bg-amber-900/60 text-amber-200",
  EM_TRANSITO: "bg-blue-900/60 text-blue-200",
  NA_FRONTEIRA: "bg-purple-900/60 text-purple-200",
  ENTREGUE: "bg-emerald-900/60 text-emerald-200",
  ENCERRADA: "bg-slate-800 text-slate-400",
  CANCELADA: "bg-red-900/60 text-red-200",
};

export function StatusBadge({ status }: { status: StatusViagem }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[status]}`}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

const SEVERIDADE_STYLES: Record<SeveridadeRisco, string> = {
  BAIXA: "bg-slate-700 text-slate-200",
  MEDIA: "bg-amber-900/60 text-amber-200",
  ALTA: "bg-orange-900/60 text-orange-200",
  CRITICA: "bg-red-900/60 text-red-200",
};

export function SeveridadeBadge({ severidade }: { severidade: SeveridadeRisco }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${SEVERIDADE_STYLES[severidade]}`}>
      {severidade}
    </span>
  );
}
