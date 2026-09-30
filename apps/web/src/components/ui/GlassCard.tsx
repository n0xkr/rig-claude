import { type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { haptic, type HapticKind } from '../../lib/haptics.js';

export type GlassAccent = 'cyan' | 'amber' | 'emerald' | 'scarlet';

const ACCENT: Record<GlassAccent, { text: string; chip: string }> = {
  cyan: { text: 'text-blue-600', chip: 'bg-blue-50 text-blue-600' },
  amber: { text: 'text-amber-600', chip: 'bg-amber-50 text-amber-600' },
  emerald: { text: 'text-emerald-600', chip: 'bg-emerald-50 text-emerald-600' },
  scarlet: { text: 'text-red-600', chip: 'bg-red-50 text-red-600' },
};

interface GlassCardProps {
  children: ReactNode;
  accent?: GlassAccent;
  className?: string;
  /** Mantido por compatibilidade: o design system não usa inclinação 3D. */
  tilt?: number;
  /** Vibra (mobile) ao tocar/clicar. */
  haptic?: HapticKind;
  onClick?: () => void;
  'data-testid'?: string;
}

/**
 * Card padrão do design system: fundo branco, borda fina slate-200,
 * arredondamento de 12px e sombra levíssima. Cards clicáveis ganham um
 * leve realce de borda/sombra no hover.
 */
export function GlassCard({
  children,
  className = '',
  haptic: hapticKind,
  onClick,
  'data-testid': testId,
}: GlassCardProps) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      data-testid={testId}
      onClick={() => {
        if (hapticKind) haptic(hapticKind);
        onClick?.();
      }}
      whileTap={reduce || !onClick ? undefined : { scale: 0.99 }}
      className={`relative rounded-xl border border-slate-200 bg-white shadow-sm transition-all duration-200 ${
        onClick ? 'cursor-pointer hover:border-slate-300 hover:shadow-md' : ''
      } ${className}`}
    >
      {children}
    </motion.div>
  );
}

/** Classes do "chip" de ícone (fundo suave + cor do acento). */
export function accentChip(accent: GlassAccent): string {
  return ACCENT[accent].chip;
}
