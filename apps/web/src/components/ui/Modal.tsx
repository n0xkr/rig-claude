import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  titulo: string;
  onClose: () => void;
  children: ReactNode;
  /** Largura máxima do diálogo. */
  size?: 'md' | 'lg';
}

/**
 * Diálogo modal padrão: portal no <body> (ancestrais animados com `transform` prendem o
 * `position: fixed`), fecha com Esc ou clique no fundo, `aria-modal` e foco inicial no diálogo.
 */
export function Modal({ titulo, onClose, children, size = 'md' }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // `onClose` costuma ser uma arrow nova a cada render: guardá-la em ref evita refocar o diálogo
  // (e roubar o foco de um campo em edição) a cada tecla digitada.
  const fecharRef = useRef(onClose);
  fecharRef.current = onClose;

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fecharRef.current();
    };
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      anterior?.focus?.();
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={`max-h-[92vh] w-full ${
          size === 'lg' ? 'max-w-3xl' : 'max-w-2xl'
        } overflow-y-auto rounded-t-2xl border border-slate-200 bg-white p-5 shadow-2xl outline-none sm:rounded-xl`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{titulo}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-xl p-1 text-slate-500 transition-all duration-200 hover:bg-slate-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
