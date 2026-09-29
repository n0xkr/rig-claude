import { useEffect, useRef } from 'react';
import { animate, useInView, useReducedMotion } from 'framer-motion';

/** Contador numérico animado (anima do valor anterior ao novo). */
export function AnimatedCounter({
  value,
  decimals = 0,
  suffix = '',
  className = '',
}: {
  value: number;
  decimals?: number;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(0);
  const inView = useInView(ref, { once: false });
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fmt = (n: number) =>
      n.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
    if (reduce || !inView) {
      el.textContent = fmt(value);
      prev.current = value;
      return;
    }
    const controls = animate(prev.current, value, {
      duration: 1.1,
      ease: 'easeOut',
      onUpdate: (n) => {
        el.textContent = fmt(n);
      },
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, decimals, suffix, inView, reduce]);

  return (
    <span ref={ref} className={className}>
      {value.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}

/** Barra de progresso circular com glow neon. */
export function CircularProgress({
  percent,
  size = 96,
  color = '#00f2fe',
  label,
}: {
  percent: number;
  size?: number;
  color?: string;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" role="img" aria-label={`${label ?? 'Progresso'}: ${clamped}%`}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped / 100)}
          style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: 'stroke-dashoffset 1s ease-out' }}
        />
      </svg>
      <span className="absolute text-sm font-semibold text-white">
        <AnimatedCounter value={clamped} suffix="%" />
      </span>
    </div>
  );
}
