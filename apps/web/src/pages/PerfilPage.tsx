import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Loader2,
  Lock,
  Save,
  Trash2,
  UserCircle,
} from 'lucide-react';
import type { Perfil, UpdatePerfilInput } from '@rigabras/shared';
import { usePerfil, reduzirImagemParaAvatar } from '../hooks/usePerfil.js';

interface FormState {
  nome_completo: string;
  funcao: string;
  atribuicoes: string;
  telefone: string;
  departamento: string;
  bio: string;
}

function paraForm(p: Perfil): FormState {
  return {
    nome_completo: p.nome_completo ?? '',
    funcao: p.funcao ?? '',
    atribuicoes: p.atribuicoes ?? '',
    telefone: p.telefone ?? '',
    departamento: p.departamento ?? '',
    bio: p.bio ?? '',
  };
}

function iniciais(nome: string): string {
  const partes = nome
    .trim()
    .split(/\s+/)
    .filter((p) => /^\p{L}/u.test(p));
  if (partes.length === 0) return '?';
  const primeira = partes[0]?.[0] ?? '';
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? '') : '';
  return (primeira + ultima).toUpperCase();
}

/** Painel do usuário: edição do próprio cadastro (exceto e-mail e papel). */
export default function PerfilPage() {
  const { perfil, carregando, salvando, erro, salvar, recarregar } = usePerfil();
  const [form, setForm] = useState<FormState | null>(null);
  const [avatar, setAvatar] = useState<string | null | undefined>(undefined); // undefined = inalterado
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [erroLocal, setErroLocal] = useState<string | null>(null);
  const [processandoFoto, setProcessandoFoto] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (perfil) {
      setForm(paraForm(perfil));
      setAvatar(undefined);
    }
  }, [perfil]);

  if (carregando && !perfil) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8" data-testid="perfil-page">
        <div className="space-y-3" role="status" aria-label="Carregando perfil">
          <div className="h-32 animate-pulse rounded-xl bg-slate-50" />
          <div className="h-64 animate-pulse rounded-xl bg-slate-50" />
          <span className="sr-only">Carregando...</span>
        </div>
      </div>
    );
  }

  if (!perfil || !form) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8" data-testid="perfil-page">
        <div
          role="alert"
          className="flex flex-col items-center gap-3 rounded-xl border border-red-200 bg-red-500/5 p-8 text-center"
        >
          <AlertTriangle className="h-8 w-8 text-red-600" />
          <p className="text-sm text-red-700">{erro ?? 'Não foi possível carregar seu perfil.'}</p>
          <button type="button" className="btn-brand" onClick={() => void recarregar()}>
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  const avatarAtual = avatar === undefined ? (perfil.avatar_url ?? null) : avatar;
  const original = paraForm(perfil);
  const camposAlterados = (Object.keys(form) as Array<keyof FormState>).some(
    (k) => form[k].trim() !== original[k].trim(),
  );
  const alterado = camposAlterados || avatar !== undefined;
  const nomeValido = form.nome_completo.trim().length >= 2;

  function setCampo<K extends keyof FormState>(campo: K, valor: string) {
    setForm((f) => (f ? { ...f, [campo]: valor } : f));
    setSucesso(null);
  }

  async function onEscolherFoto(file: File | undefined) {
    if (!file) return;
    setErroLocal(null);
    setSucesso(null);
    setProcessandoFoto(true);
    try {
      setAvatar(await reduzirImagemParaAvatar(file));
    } catch (err) {
      setErroLocal(err instanceof Error ? err.message : 'Não foi possível processar a imagem.');
    } finally {
      setProcessandoFoto(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form || !perfil || !alterado || !nomeValido) return;
    setErroLocal(null);
    setSucesso(null);
    const input: UpdatePerfilInput = {};
    (Object.keys(form) as Array<keyof FormState>).forEach((k) => {
      if (form[k].trim() !== original[k].trim()) {
        (input as Record<string, string>)[k] = form[k].trim();
      }
    });
    if (avatar !== undefined) input.avatar_url = avatar;
    const atualizado = await salvar(input);
    if (atualizado) setSucesso('Perfil atualizado com sucesso.');
  }

  const mensagemErro = erroLocal ?? erro;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8" data-testid="perfil-page">
      <div className="mb-6 flex items-center gap-2">
        <UserCircle className="h-6 w-6 text-blue-600" />
        <h1 className="text-2xl font-bold text-slate-900">Meu perfil</h1>
      </div>

      <form onSubmit={onSubmit} noValidate className="space-y-6">
        <section
          aria-label="Foto de perfil"
          className="flex flex-col items-center gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center"
        >
          <div
            className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-blue-200 bg-slate-100 text-3xl font-bold text-blue-600"
            data-testid="perfil-avatar"
          >
            {avatarAtual ? (
              <img
                src={avatarAtual}
                alt={`Foto de ${perfil.nome_completo}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <span aria-label={`Iniciais de ${perfil.nome_completo}`}>
                {iniciais(form.nome_completo)}
              </span>
            )}
          </div>
          <div className="flex flex-col items-center gap-3 sm:items-start">
            <div className="text-center sm:text-left">
              <p className="text-lg font-semibold text-slate-900">{perfil.nome_completo}</p>
              <p className="break-all text-sm text-slate-500">{perfil.email}</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                aria-label="Selecionar foto de perfil"
                data-testid="perfil-avatar-input"
                onChange={(e) => void onEscolherFoto(e.target.files?.[0])}
              />
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl border border-blue-200 px-3 py-2 text-sm text-blue-600 transition-all hover:bg-blue-100 disabled:opacity-50 duration-200"
                onClick={() => fileRef.current?.click()}
                disabled={processandoFoto || salvando}
                data-testid="perfil-avatar-alterar"
              >
                {processandoFoto ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
                Alterar foto
              </button>
              {avatarAtual && (
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 transition-all hover:border-red-200 hover:text-red-700 disabled:opacity-50 duration-200 bg-white shadow-sm"
                  onClick={() => {
                    setAvatar(null);
                    setSucesso(null);
                  }}
                  disabled={processandoFoto || salvando}
                  data-testid="perfil-avatar-remover"
                >
                  <Trash2 className="h-4 w-4" />
                  Remover foto
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500">
              A foto é ajustada automaticamente. Clique em Salvar para aplicar.
            </p>
          </div>
        </section>

        <section
          aria-label="Dados pessoais"
          className="grid gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-2"
        >
          <div className="sm:col-span-2">
            <label htmlFor="perfil-nome" className="mb-1 block text-sm font-medium text-slate-600">
              Nome completo <span className="text-red-600">*</span>
            </label>
            <input
              id="perfil-nome"
              className="input"
              value={form.nome_completo}
              onChange={(e) => setCampo('nome_completo', e.target.value)}
              required
              minLength={2}
              maxLength={200}
              autoComplete="name"
              aria-invalid={!nomeValido}
              data-testid="perfil-nome"
            />
            {!nomeValido && (
              <p className="mt-1 text-xs text-red-600">Informe pelo menos 2 caracteres.</p>
            )}
          </div>

          <div>
            <label
              htmlFor="perfil-funcao"
              className="mb-1 block text-sm font-medium text-slate-600"
            >
              Função / cargo
            </label>
            <input
              id="perfil-funcao"
              className="input"
              value={form.funcao}
              onChange={(e) => setCampo('funcao', e.target.value)}
              maxLength={120}
              autoComplete="organization-title"
              data-testid="perfil-funcao"
            />
          </div>

          <div>
            <label
              htmlFor="perfil-departamento"
              className="mb-1 block text-sm font-medium text-slate-600"
            >
              Departamento
            </label>
            <input
              id="perfil-departamento"
              className="input"
              value={form.departamento}
              onChange={(e) => setCampo('departamento', e.target.value)}
              maxLength={120}
              data-testid="perfil-departamento"
            />
          </div>

          <div>
            <label
              htmlFor="perfil-telefone"
              className="mb-1 block text-sm font-medium text-slate-600"
            >
              Telefone
            </label>
            <input
              id="perfil-telefone"
              type="tel"
              className="input"
              value={form.telefone}
              onChange={(e) => setCampo('telefone', e.target.value)}
              maxLength={40}
              autoComplete="tel"
              data-testid="perfil-telefone"
            />
          </div>

          <div className="hidden sm:block" aria-hidden="true" />

          <div className="sm:col-span-2">
            <label
              htmlFor="perfil-atribuicoes"
              className="mb-1 block text-sm font-medium text-slate-600"
            >
              Atribuições
            </label>
            <textarea
              id="perfil-atribuicoes"
              className="input min-h-[96px] resize-y"
              rows={4}
              value={form.atribuicoes}
              onChange={(e) => setCampo('atribuicoes', e.target.value)}
              maxLength={2000}
              data-testid="perfil-atribuicoes"
            />
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="perfil-bio" className="mb-1 block text-sm font-medium text-slate-600">
              Sobre mim
            </label>
            <textarea
              id="perfil-bio"
              className="input min-h-[96px] resize-y"
              rows={4}
              value={form.bio}
              onChange={(e) => setCampo('bio', e.target.value)}
              maxLength={1000}
              data-testid="perfil-bio"
            />
          </div>
        </section>

        <section
          aria-label="Dados da conta"
          className="grid gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-2"
        >
          <div>
            <label
              htmlFor="perfil-email"
              className="mb-1 flex items-center gap-1 text-sm font-medium text-slate-600"
            >
              <Lock className="h-3.5 w-3.5 text-slate-500" /> E-mail
            </label>
            <input
              id="perfil-email"
              className="input cursor-not-allowed opacity-70"
              value={perfil.email}
              readOnly
              aria-describedby="perfil-email-dica"
              data-testid="perfil-email"
            />
            <p id="perfil-email-dica" className="mt-1 text-xs text-slate-500">
              Não pode ser alterado por aqui.
            </p>
          </div>
          <div>
            <label
              htmlFor="perfil-role"
              className="mb-1 flex items-center gap-1 text-sm font-medium text-slate-600"
            >
              <Lock className="h-3.5 w-3.5 text-slate-500" /> Papel
            </label>
            <input
              id="perfil-role"
              className="input cursor-not-allowed opacity-70"
              value={perfil.role}
              readOnly
              aria-describedby="perfil-role-dica"
              data-testid="perfil-role"
            />
            <p id="perfil-role-dica" className="mt-1 text-xs text-slate-500">
              Não pode ser alterado por aqui.
            </p>
          </div>
        </section>

        {mensagemErro && (
          <p
            role="alert"
            className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-500/10 px-3 py-2 text-sm text-red-700"
            data-testid="perfil-erro"
          >
            <AlertTriangle className="h-4 w-4 shrink-0" /> {mensagemErro}
          </p>
        )}
        {sucesso && (
          <p
            role="status"
            className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700"
            data-testid="perfil-sucesso"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" /> {sucesso}
          </p>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            className="btn-brand w-full sm:w-auto"
            disabled={!alterado || !nomeValido || salvando || processandoFoto}
            data-testid="perfil-salvar"
          >
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {salvando ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </form>
    </div>
  );
}
