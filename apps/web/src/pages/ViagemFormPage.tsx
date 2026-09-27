import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WifiOff } from 'lucide-react';
import type { CreateViagemInput } from '@rigabras/shared';
import { useCreateViagem } from '../hooks/useViagens.js';

const PAISES = ['AR', 'BO', 'CL', 'PY', 'UY', 'PE'] as const;

export default function ViagemFormPage() {
  const navigate = useNavigate();
  const { create, submitting, error } = useCreateViagem();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [form, setForm] = useState({
    numero_crt: '',
    placa_cavalo: '',
    origem: 'Uruguaiana/RS',
    destino: '',
    pais_destino: 'AR' as (typeof PAISES)[number],
    peso_kg: '',
    valor_frete: '',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);

    const payload: CreateViagemInput = {
      numero_crt: form.numero_crt || undefined,
      placa_cavalo: form.placa_cavalo,
      origem: form.origem,
      destino: form.destino,
      pais_destino: form.pais_destino,
      peso_kg: form.peso_kg ? Number(form.peso_kg) : undefined,
      valor_frete: form.valor_frete ? Number(form.valor_frete) : undefined,
      status: 'PROGRAMADA',
    };

    try {
      const { queued } = await create(payload);
      if (queued) {
        setFeedback('Sem conexão: viagem salva localmente e será sincronizada automaticamente.');
        return;
      }
      navigate('/viagens');
    } catch {
      // erro já é exposto via `error` do hook
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-white">Nova viagem</h1>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-slate-800 p-6">
        <Field label="Número do CRT (opcional)">
          <input
            className="input"
            value={form.numero_crt}
            onChange={(e) => setForm((f) => ({ ...f, numero_crt: e.target.value }))}
            placeholder="CRT-2026-000123"
          />
        </Field>
        <Field label="Placa do cavalo *">
          <input
            required
            className="input"
            value={form.placa_cavalo}
            onChange={(e) => setForm((f) => ({ ...f, placa_cavalo: e.target.value.toUpperCase() }))}
            placeholder="IRZ1A23"
          />
        </Field>
        <Field label="Origem *">
          <input
            required
            className="input"
            value={form.origem}
            onChange={(e) => setForm((f) => ({ ...f, origem: e.target.value }))}
          />
        </Field>
        <Field label="Destino *">
          <input
            required
            className="input"
            value={form.destino}
            onChange={(e) => setForm((f) => ({ ...f, destino: e.target.value }))}
            placeholder="Buenos Aires/AR"
          />
        </Field>
        <Field label="País de destino *">
          <select
            className="input"
            value={form.pais_destino}
            onChange={(e) =>
              setForm((f) => ({ ...f, pais_destino: e.target.value as (typeof PAISES)[number] }))
            }
          >
            {PAISES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Peso (kg)">
            <input
              type="number"
              className="input"
              value={form.peso_kg}
              onChange={(e) => setForm((f) => ({ ...f, peso_kg: e.target.value }))}
            />
          </Field>
          <Field label="Valor do frete (R$)">
            <input
              type="number"
              className="input"
              value={form.valor_frete}
              onChange={(e) => setForm((f) => ({ ...f, valor_frete: e.target.value }))}
            />
          </Field>
        </div>

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
          {submitting ? 'Salvando...' : 'Criar viagem'}
        </button>
      </form>
    </div>
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
