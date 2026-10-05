import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, UploadCloud } from 'lucide-react';
import {
  onQueueChange,
  statusDaFila,
  tentarNovamenteFalhas,
  type QueueStatus,
} from '../../offline/syncManager.js';
import { haptic } from '../../lib/haptics.js';

/**
 * Indicador da fila offline no header: mostra operações pendentes de envio e,
 * quando houver falhas permanentes, oferece reenvio manual.
 */
export function OfflineQueueIndicator() {
  const [fila, setFila] = useState<QueueStatus>({ pending: 0, failed: 0 });
  const [reenviando, setReenviando] = useState(false);

  useEffect(() => {
    let ativo = true;
    void statusDaFila().then((s) => {
      if (ativo) setFila(s);
    });
    const cancelar = onQueueChange((s) => setFila(s));
    return () => {
      ativo = false;
      cancelar();
    };
  }, []);

  if (fila.pending === 0 && fila.failed === 0) return null;

  async function reenviar() {
    haptic('warning');
    setReenviando(true);
    try {
      await tentarNovamenteFalhas();
    } finally {
      setReenviando(false);
    }
  }

  if (fila.failed > 0) {
    return (
      <button
        type="button"
        data-testid="fila-offline-falhas"
        onClick={() => void reenviar()}
        disabled={reenviando}
        className="flex items-center gap-1.5 rounded-xl bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 transition-all duration-200 hover:bg-amber-100 disabled:opacity-60"
        aria-label={`${fila.failed} operações offline com falha. Clique para reenviar`}
        title="Operações offline com falha — clique para reenviar"
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        {reenviando ? 'Reenviando…' : `${fila.failed} com falha`}
        {!reenviando && <RefreshCw className="h-3.5 w-3.5" />}
      </button>
    );
  }

  return (
    <span
      data-testid="fila-offline-pendente"
      role="status"
      aria-label={`${fila.pending} operações offline pendentes de envio`}
      title="Operações offline aguardando sincronização"
      className="flex items-center gap-1.5 rounded-xl bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700"
    >
      <UploadCloud className="h-3.5 w-3.5" />
      {fila.pending} aguardando envio
    </span>
  );
}
