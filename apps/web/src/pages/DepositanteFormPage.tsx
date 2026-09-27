import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, WifiOff } from 'lucide-react';
import type { CreateDepositanteInput } from '@rigabras/shared';
import { useCreateDepositante } from '../hooks/useDepositantes.js';

/** Formulário de cadastro de depositante (Módulo 5, WMS — Armazém Geral). */
export default function DepositanteFormPage() {
  const navigate = useNavigate();
  const { create, submitting, error } = useCreateDepositante();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [form, setForm] = useState({
    razao_social: '',
    cnpj_cpf: '',
    contato_nome: '',
    contato_email: '',
    contato_telefone: '',
    observacoes: '',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    const payload: CreateDepositanteInput = {
      razao_social: form.razao_social,
      cnpj_cpf: form.cnpj_cpf,
      contato_nome: form.contato_nome || undefined,
      contato_email: form.contato_email || undefined,
      contato_telefone: form.contato_telefone || undefined,
      observacoes: form.observacoes || undefined,
    };
    try {
      const { queued } = await create(payload);
      if (queued) {
        setFeedback(
          'Sem conexão: depositante salvo localmente e será sincronizado automaticamente.',
        );
        return;
      }
      navigate('/wms/depositantes');
    } catch {
      // erro já exposto via `error`
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link
        to="/wms/depositantes"
        className="mb-4 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para depositantes
      </Link>
      <h1 className="mb-6 text-2xl font-bold text-white">Novo depositante</h1>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-slate-800 p-6">
        <Field label="Razão social *">
          <input
            required
            className="input"
            value={form.razao_social}
            onChange={(e) => setForm((f) => ({ ...f, razao_social: e.target.value }))}
          />
        </Field>
        <Field label="CNPJ/CPF *">
          <input
            required
            className="input"
            value={form.cnpj_cpf}
            onChange={(e) => setForm((f) => ({ ...f, cnpj_cpf: e.target.value }))}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Contato (nome)">
            <input
              className="input"
              value={form.contato_nome}
              onChange={(e) => setForm((f) => ({ ...f, contato_nome: e.target.value }))}
            />
          </Field>
          <Field label="Contato (telefone)">
            <input
              className="input"
              value={form.contato_telefone}
              onChange={(e) => setForm((f) => ({ ...f, contato_telefone: e.target.value }))}
            />
          </Field>
        </div>
        <Field label="Contato (e-mail)">
          <input
            type="email"
            className="input"
            value={form.contato_email}
            onChange={(e) => setForm((f) => ({ ...f, contato_email: e.target.value }))}
          />
        </Field>
        <Field label="Observações">
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
          {submitting ? 'Salvando...' : 'Cadastrar depositante'}
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
