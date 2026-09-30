import { useCallback, useEffect, useState } from 'react';

/** Espelha THEME_META de themes.cjs (que gera as variáveis CSS de cada tema). */
export interface TemaInfo {
  id: string;
  nome: string;
  escuro: boolean;
  /** Fundo da página, fundo dos cards e cor de destaque (para a miniatura). */
  amostra: [string, string, string];
}

export const TEMAS: TemaInfo[] = [
  { id: 'claro', nome: 'Claro', escuro: false, amostra: ['#f8fafc', '#ffffff', '#2563eb'] },
  { id: 'suave', nome: 'Suave', escuro: false, amostra: ['#e9edf2', '#f7f8fa', '#2563eb'] },
  { id: 'escuro', nome: 'Escuro', escuro: true, amostra: ['#0b1120', '#131c2f', '#3b82f6'] },
  { id: 'meianoite', nome: 'Meia-noite', escuro: true, amostra: ['#060a18', '#0c1330', '#3b82f6'] },
  { id: 'grafite', nome: 'Grafite', escuro: true, amostra: ['#111113', '#1b1b1e', '#3b82f6'] },
  { id: 'floresta', nome: 'Floresta', escuro: true, amostra: ['#07110c', '#0e1c15', '#16a34a'] },
];

const CHAVE = 'rigabras_tema';
const PADRAO = 'claro';

function lerSalvo(): string {
  try {
    const t = localStorage.getItem(CHAVE);
    if (t && TEMAS.some((x) => x.id === t)) return t;
  } catch {
    /* localStorage indisponível: usa o padrão */
  }
  return PADRAO;
}

function aplicar(id: string) {
  document.documentElement.setAttribute('data-theme', id);
  const info = TEMAS.find((t) => t.id === id);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', info?.amostra[0] ?? '#f8fafc');
}

/** Tema atual do site, persistido no navegador. */
export function useTema() {
  const [tema, setTemaState] = useState(lerSalvo);

  useEffect(() => aplicar(tema), [tema]);

  const setTema = useCallback((id: string) => {
    try {
      localStorage.setItem(CHAVE, id);
    } catch {
      /* sem persistência: vale só nesta sessão */
    }
    setTemaState(id);
  }, []);

  return { tema, setTema, temas: TEMAS };
}
