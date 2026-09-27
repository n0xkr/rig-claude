import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { ApiError, apiFetch } from '../lib/apiClient.js';
import logo from '../assets/logo-rigabras.jpg';

interface RegisterResponse {
  accessToken: string;
  profile: { id: string; email: string; role: string; nome_completo: string };
}

/**
 * Tela de autocadastro — chama `POST /auth/register` (novo endpoint da API,
 * ver `apps/api/src/modules/auth`), que cria o usuário no Supabase Auth e o
 * `profiles` correspondente com papel `VISITANTE`. Segue o mesmo padrão de
 * `LoginPage.tsx`: guarda o access token retornado e navega para `/viagens`.
 */
export default function RegisterPage() {
  const navigate = useNavigate();
  const [nomeCompleto, setNomeCompleto] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<RegisterResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ nome_completo: nomeCompleto, email, password }),
      });
      localStorage.setItem('rigabras_access_token', result.accessToken);
      navigate('/viagens');
    } catch (err) {
      const message =
        err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Falha ao cadastrar';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 animate-float rounded-full bg-brand-yellow/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 animate-float rounded-full bg-brand-green/20 blur-3xl [animation-delay:2s]" />

      <div className="card-glass relative w-full max-w-sm animate-fade-in px-8 py-10">
        <div className="mb-6 flex flex-col items-center text-center">
          <img
            src={logo}
            alt="Rigabras"
            className="mb-4 h-20 w-20 rounded-2xl shadow-glow-yellow"
          />
          <h1 className="text-2xl font-bold text-white">
            Criar <span className="brand-text-gradient">conta</span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Ecossistema Integrado de Gestão Logística (TMS + WMS)
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" data-testid="register-form">
          <label className="flex flex-col gap-1 text-sm text-slate-300">
            Nome completo
            <input
              type="text"
              required
              minLength={2}
              autoComplete="name"
              className="input"
              value={nomeCompleto}
              data-testid="register-nome"
              onChange={(e) => setNomeCompleto(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-300">
            E-mail
            <input
              type="email"
              required
              autoComplete="username"
              className="input"
              value={email}
              data-testid="register-email"
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-300">
            Senha
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="input"
              value={password}
              data-testid="register-password"
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <div
              role="alert"
              data-testid="register-error"
              className="rounded-md border border-red-800 bg-red-950/30 p-3 text-sm text-red-300"
            >
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            data-testid="register-submit"
            className="btn-brand"
          >
            <UserPlus className="h-4 w-4" /> {loading ? 'Criando conta…' : 'Criar conta'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          Já tem conta?{' '}
          <Link to="/login" className="font-medium text-brand-green hover:text-brand-yellow">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
