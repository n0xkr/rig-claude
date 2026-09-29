/** Feedback tátil (Vibration API) para o PWA mobile — no-op onde não houver suporte. */
export type HapticKind = 'tap' | 'success' | 'warning' | 'error';

const PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 12,
  success: [18, 40, 18],
  warning: [40, 60, 40],
  error: [70, 50, 70, 50, 120],
};

export function haptic(kind: HapticKind = 'tap'): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(PATTERNS[kind]);
    }
  } catch {
    /* alguns navegadores lançam sem gesto do usuário — ignorar */
  }
}
