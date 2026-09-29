import { motion, useReducedMotion } from 'framer-motion';

export interface Slice {
  label: string;
  value: number;
  color: string;
}

/** Rosca SVG com animação de entrada e total no centro. */
export function DonutChart({ data, size = 170 }: { data: Slice[]; size?: number }) {
  const reduce = useReducedMotion();
  const total = data.reduce((a, d) => a + d.value, 0);
  const stroke = 22;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let acumulado = 0;
  return (
    <div className="flex flex-wrap items-center justify-center gap-6">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" role="img" aria-label="Distribuição por status">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
          {total > 0 &&
            data
              .filter((d) => d.value > 0)
              .map((d) => {
                const len = (d.value / total) * c;
                const offset = -acumulado;
                acumulado += len;
                return (
                  <motion.circle
                    key={d.label}
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    stroke={d.color}
                    strokeWidth={stroke}
                    strokeDasharray={`${len} ${c - len}`}
                    strokeDashoffset={offset}
                    style={{ filter: `drop-shadow(0 0 5px ${d.color}88)` }}
                    initial={reduce ? false : { opacity: 0, strokeDasharray: `0 ${c}` }}
                    animate={{ opacity: 1, strokeDasharray: `${len} ${c - len}` }}
                    transition={{ duration: 0.9, ease: 'easeOut' }}
                  />
                );
              })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-white">{total}</span>
          <span className="text-xs text-slate-400">veículos</span>
        </div>
      </div>
      <ul className="space-y-2 text-sm">
        {data.map((d) => (
          <li key={d.label} className="flex items-center gap-2 text-slate-300">
            <span className="h-3 w-3 rounded-full" style={{ background: d.color, boxShadow: `0 0 8px ${d.color}` }} />
            <span className="w-28">{d.label}</span>
            <span className="font-semibold text-white">{d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface BarDatum {
  label: string;
  value: number;
  /** Texto exibido à direita da barra. */
  display?: string;
  color?: string;
}

/** Barras horizontais animadas (ranking, nível de combustível, etc.). */
export function BarList({
  data,
  max,
  emptyText = 'Sem dados',
}: {
  data: BarDatum[];
  max?: number;
  emptyText?: string;
}) {
  const reduce = useReducedMotion();
  if (data.length === 0) return <p className="py-6 text-center text-sm text-slate-500">{emptyText}</p>;
  const teto = max ?? Math.max(...data.map((d) => d.value), 1);
  return (
    <ul className="space-y-2.5">
      {data.map((d, i) => {
        const cor = d.color ?? '#00f2fe';
        return (
          <li key={d.label} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 text-xs">
            <span className="truncate font-mono text-slate-300">{d.label}</span>
            <div className="h-3 overflow-hidden rounded-full bg-white/5">
              <motion.div
                className="h-full rounded-full"
                style={{ background: `linear-gradient(90deg, ${cor}55, ${cor})`, boxShadow: `0 0 10px ${cor}66` }}
                initial={reduce ? false : { width: 0 }}
                animate={{ width: `${Math.max(2, Math.min(100, (d.value / teto) * 100))}%` }}
                transition={{ duration: 0.7, delay: i * 0.04, ease: 'easeOut' }}
              />
            </div>
            <span className="w-20 text-right text-slate-400">{d.display ?? d.value.toLocaleString('pt-BR')}</span>
          </li>
        );
      })}
    </ul>
  );
}
