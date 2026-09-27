import { useState } from 'react';
import { WifiOff } from 'lucide-react';
import type { CreateFreteInput } from '@rigabras/shared';
import { useCreateFrete } from '../hooks/useFretes.js';

/**
 * Formulário de registro do frete contratado de uma viagem (Módulo 3,
 * critério #1), incluindo os dados do frete de retorno vazio (critério #4).
 * Reaproveitado tanto na tela vazia de `/viagens/:id/frete` quanto poderia
 * ser embutido em outros pontos de entrada futuros.
 */
export function FreteContratadoForm({
  viagemId,
  onCreated,
}: {
  viagemId: string;
  onCreated: () => void;
}) {
  const { create, submitting, error } = useCreateFrete();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [form, setForm] = useState({
    numero_fatura: '',
    valor_contratado: '',
    retorno_vazio: true,
    valor_custo_retorno_vazio: '',
    valor_frete_retorno: '',
    observacoes: '',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);

    const payload: CreateFreteInput = {
      viagem_id: viagemId,
      numero_fatura: form.numero_fatura || undefined,
      valor_contratado: Number(form.valor_contratado),
      retorno_vazio: form.retorno_vazio,
      valor_custo_retorno_vazio: form.valor_custo_retorno_vazio
        ? Number(form.valor_custo_retorno_vazio)
        : undefined,
      valor_frete_retorno: form.valor_frete_retorno ? Number(form.valor_frete_retorno) : undefined,
      observacoes: form.observacoes || undefined,
    };

    try {
      const { queued } = await create(payload);
      if (queued) {
        setFeedback('Sem conexão: frete salvo localmente e será sincronizado automaticamente.');
        return;
      }
      onCreated();
    } catch {
      // erro já é exposto via `error` do hook
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-slate-800 p-6">
      <h2 className="text-lg font-semibold text-white">Registrar frete contratado</h2>
      <Field label="Número da fatura (opcional)">
        <input
          className="input"
          value={form.numero_fatura}
          onChange={(e) => setForm((f) => ({ ...f, numero_fatura: e.target.value }))}
        />
      </Field>
      <Field label="Valor contratado (R$) *">
        <input
          required
          type="number"
          min={0}
          step="0.01"
          className="input"
          value={form.valor_contratado}
          onChange={(e) => setForm((f) => ({ ...f, valor_contratado: e.target.value }))}
        />
      </Field>

      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input
          type="checkbox"
          checked={form.retorno_vazio}
          onChange={(e) => setForm((f) => ({ ...f, retorno_vazio: e.target.checked }))}
        />
        Veículo retorna vazio (sem carga de backhaul)
      </label>

      {form.retorno_vazio ? (
        <Field label="Custo estimado do retorno vazio (R$)">
          <input
            type="number"
            min={0}
            step="0.01"
            className="input"
            value={form.valor_custo_retorno_vazio}
            onChange={(e) => setForm((f) => ({ ...f, valor_custo_retorno_vazio: e.target.value }))}
          />
        </Field>
      ) : (
        <Field label="Valor do frete de retorno (R$) *">
          <input
            required
            type="number"
            min={0}
            step="0.01"
            className="input"
            value={form.valor_frete_retorno}
            onChange={(e) => setForm((f) => ({ ...f, valor_frete_retorno: e.target.value }))}
          />
        </Field>
      )}

      <Field label="Observações (opcional)">
        <textarea
          className="input"
          rows={2}
          value={form.observacoes}
          onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
        />
      </Field>

      {feedback && (
        <div className="flex items-center gap-2 rounded-md border border-amber-800 bg-amber-950/40 px-3 py-2 text-sm text-amber-200">
          <WifiOff className="h-4 w-4 shrink-0" /> {feedback}
        </div>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-rigabras-500 px-4 py-2 font-medium text-white hover:bg-blue-600 disabled:opacity-50"
      >
        {submitting ? 'Salvando...' : 'Registrar frete'}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-300">{label}</span>
      {children}
    </label>
  );
}
