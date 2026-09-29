import { useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Camera, FileText, LogOut } from 'lucide-react';
import type { StatusPortariaEntrada, TipoDocumentoPortaria } from '@rigabras/shared';
import { TRANSICOES_STATUS_PORTARIA_ENTRADA } from '@rigabras/shared';
import { usePortariaEntradaDetail, usePortariaActions } from '../hooks/usePortaria.js';
import { getCurrentUserRole } from '../lib/apiClient.js';
import { LoadingSkeleton, ErrorCard } from '../components/StateViews.js';
import { PortariaEntradaStatusBadge } from '../components/StatusBadge.js';

const PROXIMO_STATUS_LABEL: Partial<Record<StatusPortariaEntrada, string>> = {
  CONFERIDO: 'Confirmar conferência de documentos',
  LIBERADO_PATIO: 'Liberar veículo no pátio',
  AGUARDANDO_SAIDA: 'Marcar aguardando saída',
};

const TIPOS_DOCUMENTO: TipoDocumentoPortaria[] = [
  'CRT',
  'ORDEM_COLETA',
  'NOTA_FISCAL',
  'CNH',
  'OUTRO',
];

/** Detalhe/workflow de uma entrada de portaria (Módulo 8): documentos, avanço de status e saída. */
export default function PortariaEntradaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { state, entrada, error, reload } = usePortariaEntradaDetail(id);
  const {
    atualizarStatus,
    anexarArquivo,
    obterUrlDocumento,
    registrarSaida,
    submitting,
    error: actionError,
  } = usePortariaActions();
  // Só gating de UX — a autorização real é da API (RBAC): porteiro registra
  // (documentos/saída), OPERADOR+ confere e avança o status; VISITANTE só lê.
  const role = getCurrentUserRole();
  const podeRegistrar =
    role === 'SUPERADMIN' || role === 'ADMIN' || role === 'OPERADOR' || role === 'PORTARIA';
  const podeAvancarStatus = role === 'SUPERADMIN' || role === 'ADMIN' || role === 'OPERADOR';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tipoDocumento, setTipoDocumento] = useState<TipoDocumentoPortaria>('CRT');
  const [uploading, setUploading] = useState(false);
  const [situacaoDescarga, setSituacaoDescarga] = useState('FINALIZADA');

  if (state === 'loading' || state === 'idle') return <LoadingSkeleton />;
  if (state === 'error' || !entrada)
    return <ErrorCard message={error ?? 'Erro'} onRetry={reload} />;

  const status = entrada.status ?? 'AGUARDANDO_CONFERENCIA';
  const proximosStatus = TRANSICOES_STATUS_PORTARIA_ENTRADA[status].filter(
    (s) => s !== 'CANCELADA',
  );

  async function handleFileSelected(file: File) {
    if (!id) return;
    setUploading(true);
    try {
      await anexarArquivo(id, tipoDocumento, file);
      reload();
    } catch {
      // o hook já expõe a mensagem em `actionError`
    } finally {
      setUploading(false);
    }
  }

  /** Abre o documento via signed URL temporária gerada pela API (bucket privado). */
  async function handleAbrirDocumento(documentoId: string) {
    if (!id) return;
    // Abre a aba antes do await para não ser bloqueada como popup.
    const janela = window.open('', '_blank');
    try {
      const resultado = await obterUrlDocumento(id, documentoId);
      if (resultado?.url && janela) janela.location.href = resultado.url;
      else janela?.close();
    } catch {
      janela?.close();
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
      <Link
        to="/portaria"
        className="mb-4 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 transition-all duration-200"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para portaria
      </Link>

      <div className="mb-6 flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {entrada.placa_cavalo}
            {entrada.placa_carreta ? ` / ${entrada.placa_carreta}` : ''}
          </h1>
          <p className="text-sm text-slate-500">
            {entrada.motorista_nome} ·{' '}
            {entrada.data_entrada && new Date(entrada.data_entrada).toLocaleString('pt-BR')}
          </p>
        </div>
        <PortariaEntradaStatusBadge status={status} />
      </div>

      {entrada.viagem_id && (
        <Link
          to={`/viagens/${entrada.viagem_id}`}
          className="mb-6 block rounded-xl border border-slate-200 p-3 text-sm text-slate-600 hover:bg-slate-50 transition-all duration-200 bg-white shadow-sm"
        >
          Vinculado à viagem {entrada.viagem_id.slice(0, 8)} (CRT {entrada.numero_crt ?? '—'})
        </Link>
      )}

      {/* Documentos */}
      <section className="mb-6 rounded-xl border border-slate-200 p-6 bg-white shadow-sm">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700">
          <FileText className="h-4 w-4" /> Documentos
        </h2>
        <div className="mb-3 space-y-2">
          {entrada.documentos.length === 0 && (
            <p className="text-sm text-slate-500">Nenhum documento anexado ainda.</p>
          )}
          {entrada.documentos.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm"
            >
              <button
                type="button"
                onClick={() => void handleAbrirDocumento(doc.id)}
                className="text-left text-slate-600 underline-offset-2 hover:underline transition-all duration-200"
              >
                {doc.tipo_documento} — {doc.nome_arquivo ?? doc.storage_path}
              </button>
              <span className="text-xs text-slate-500">
                {doc.conferido_em ? 'conferido' : 'aguardando conferência'}
              </span>
            </div>
          ))}
        </div>
        {podeRegistrar && (
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="input w-auto"
              value={tipoDocumento}
              onChange={(e) => setTipoDocumento(e.target.value as TipoDocumentoPortaria)}
            >
              {TIPOS_DOCUMENTO.map((t) => (
                <option key={t} value={t}>
                  {t.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50 transition-all duration-200 bg-white shadow-sm"
            >
              <Camera className="h-4 w-4" /> {uploading ? 'Enviando...' : 'Fotografar / anexar'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFileSelected(file);
                e.target.value = '';
              }}
            />
          </div>
        )}
      </section>

      {/* Avanço de status */}
      {podeAvancarStatus && proximosStatus.length > 0 && status !== 'AGUARDANDO_SAIDA' && (
        <div className="mb-6 flex flex-wrap gap-2">
          {proximosStatus.map((proximo) => (
            <button
              key={proximo}
              disabled={submitting}
              onClick={async () => {
                await atualizarStatus(entrada.id, proximo);
                reload();
              }}
              className="rounded-xl bg-rigabras-500 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-all duration-200"
            >
              {PROXIMO_STATUS_LABEL[proximo] ?? proximo}
            </button>
          ))}
        </div>
      )}

      {/* Saída */}
      {podeRegistrar && status === 'AGUARDANDO_SAIDA' && !entrada.saida && (
        <section className="mb-6 rounded-xl border border-slate-200 p-6 bg-white shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700">
            <LogOut className="h-4 w-4" /> Registrar saída
          </h2>
          <label className="mb-3 block">
            <span className="mb-1 block text-sm font-medium text-slate-600">
              Situação da descarga
            </span>
            <select
              className="input"
              value={situacaoDescarga}
              onChange={(e) => setSituacaoDescarga(e.target.value)}
            >
              <option value="FINALIZADA">Finalizada</option>
              <option value="PARCIAL">Parcial</option>
              <option value="PENDENTE">Pendente</option>
            </select>
          </label>
          <button
            disabled={submitting}
            onClick={async () => {
              await registrarSaida(entrada.id, { situacao_descarga: situacaoDescarga });
              reload();
            }}
            className="w-full rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-all duration-200"
          >
            Confirmar saída
          </button>
        </section>
      )}

      {entrada.saida && (
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          Saída registrada em {new Date(entrada.saida.created_at ?? '').toLocaleString('pt-BR')} —
          permanência no pátio: {entrada.saida.tempo_patio_minutos} min.
        </div>
      )}

      {actionError && <p className="text-sm text-red-600">{actionError}</p>}
    </div>
  );
}
