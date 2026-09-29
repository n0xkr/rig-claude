import { useRef, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';
import { haptic, type HapticKind } from '../../lib/haptics.js';

export type GlassAccent = 'cyan' | 'amber' | 'emerald' | 'scarlet';

const ACCENT: Record<GlassAccent, { rgb: string; text: string }> = {
  cyan: { rgb: '0, 242, 254', text: 'text-tms-cyan' },
  amber: { rgb: '255, 159, 67', text: 'text-tms-amber' },
  emerald: { rgb: '16, 185, 129', text: 'text-emerald-400' },
  scarlet: { rgb: '239, 68, 68', text: 'text-red-400' },
};

interface GlassCardProps {
  children: ReactNode;
  accent?: GlassAccent;
  className?: string;
  /** Inclinação 3D máxima em graus (0 desativa o tilt). */
  tilt?: number;
  /** Vibra (mobile) ao tocar/clicar. */
  haptic?: HapticKind;
  onClick?: () => void;
  'data-testid'?: string;
}

/**
 * Card de "vidro temperado": backdrop-blur, borda com brilho neon, sombras em
 * várias camadas e tilt 3D que segue o cursor/toque (desativado quando o
 * usuário prefere movimento reduzido). O brilho especular acompanha o ponteiro.
 */
export function GlassCard({
  children,
  accent = 'cyan',
  className = '',
  tilt = 6,
  haptic: hapticKind,
  onClick,
  'data-testid': testId,
}: GlassCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const rx = useSpring(useMotionValue(0), { stiffness: 220, damping: 22 });
  const ry = useSpring(useMotionValue(0), { stiffness: 220, damping: 22 });
  const mx = useMotionValue(50);
  const my = useMotionValue(50);
  const shine = useMotionTemplate`radial-gradient(240px circle at ${mx}% ${my}%, rgba(${ACCENT[accent].rgb}, 0.16), transparent 70%)`;
  const rgb = ACCENT[accent].rgb;

  function handleMove(e: MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    mx.set(px * 100);
    my.set(py * 100);
    if (!reduce && tilt > 0) {
      ry.set((px - 0.5) * 2 * tilt);
      rx.set((0.5 - py) * 2 * tilt);
    }
  }

  function reset() {
    rx.set(0);
    ry.set(0);
  }

  const style: CSSProperties = {
    boxShadow: `0 1px 0 rgba(255,255,255,0.08) inset, 0 0 0 1px rgba(${rgb}, 0.22), 0 10px 30px rgba(0,0,0,0.45), 0 0 32px rgba(${rgb}, 0.12)`,
  };

  return (
    <motion.div
      ref={ref}
      data-testid={testId}
      onMouseMove={handleMove}
      onMouseLeave={reset}
      onClick={() => {
        if (hapticKind) haptic(hapticKind);
        onClick?.();
      }}
      style={{ ...style, rotateX: rx, rotateY: ry, transformPerspective: 900 }}
      whileTap={reduce || !onClick ? undefined : { scale: 0.985 }}
      className={`relative overflow-hidden rounded-2xl border border-white/10 bg-[#0e1726]/60 backdrop-blur-xl ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
    >
      <motion.div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: shine }} />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, rgba(${rgb}, 0.9), transparent)` }}
      />
      <div className="relative">{children}</div>
    </motion.div>
  );
}

export function accentText(accent: GlassAccent): string {
  return ACCENT[accent].text;
}
