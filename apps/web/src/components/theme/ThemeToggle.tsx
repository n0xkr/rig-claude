import { useEffect, useRef, useState } from 'react';
import { Check, Palette } from 'lucide-react';
import { useTema } from '../../lib/temas.js';
import { haptic } from '../../lib/haptics.js';

/** Botão do header que abre a lista de modelos de tema do site. */
export function ThemeToggle() {
  const { tema, setTema, temas } = useTema();
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false);
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto]);

  return (
    <div ref={raiz} className="relative">
      <button
        type="button"
        data-testid="theme-toggle"
        onClick={() => setAberto((a) => !a)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label="Trocar tema do site"
        title="Tema do site"
        className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm text-slate-600 transition-all duration-200 hover:bg-slate-50 hover:text-slate-900"
      >
        <Palette className="h-4 w-4" />
        <span className="hidden sm:inline">Tema</span>
      </button>
      {aberto && (
        <div
          role="menu"
          aria-label="Modelos de tema"
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl"
        >
          <p className="px-2 pb-1.5 pt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Modelo do site
          </p>
          {temas.map((t) => {
            const ativo = t.id === tema;
            return (
              <button
                key={t.id}
                type="button"
                role="menuitemradio"
                aria-checked={ativo}
                data-testid={`tema-${t.id}`}
                onClick={() => {
                  haptic('tap');
                  setTema(t.id);
                  setAberto(false);
                }}
                className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition-colors ${
                  ativo
                    ? 'bg-blue-50 font-semibold text-blue-700'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span
                  aria-hidden
                  className="flex h-8 w-12 shrink-0 overflow-hidden rounded-md border border-slate-300"
                  style={{ background: t.amostra[0] }}
                >
                  <span
                    className="m-1 flex-1 rounded-sm"
                    style={{ background: t.amostra[1], borderTop: `3px solid ${t.amostra[2]}` }}
                  />
                </span>
                <span className="flex-1">
                  {t.nome}
                  <span className="block text-xs font-normal text-slate-500">
                    {t.escuro ? 'Escuro' : 'Claro'}
                  </span>
                </span>
                {ativo && <Check className="h-4 w-4" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
