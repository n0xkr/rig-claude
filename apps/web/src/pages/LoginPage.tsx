import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { ApiError, apiFetch } from '../lib/apiClient.js';
import logo from '../assets/logo-rigabras.jpg';

interface LoginResponse {
  accessToken: string;
  profile: { id: string; email: string; role: string; nome_completo: string };
}

/**
 * Tela de login. Bug/gap real encontrado nesta sessão: a API sempre teve
 * `POST /api/v1/auth/login` funcional (`apps/api/src/modules/auth`), mas o
 * frontend nunca teve uma tela que chamasse esse endpoint — `apiClient.ts`
 * já lia `localStorage.getItem('rigabras_access_token')` em toda chamada,
 * mas nada no app jamais ESCREVIA essa chave, então não havia como um
 * usuário real se autenticar pela UI. Esta tela fecha esse gap: chama
 * `/auth/login`, guarda o access token em `localStorage` (mesma chave que
 * `apiClient.ts` já lia) e navega para `/viagens`. O refresh token rotativo
 * continua vindo em cookie httpOnly (setado pela própria resposta da API),
 * sem necessidade de nenhum código aqui.
 */
export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await apiFetch<LoginResponse>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem('rigabras_access_token', result.accessToken);
      navigate('/viagens');
    } catch (err) {
      const message =
        err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Falha ao entrar';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8">
      <div className="card-glass relative w-full max-w-sm animate-fade-in px-8 py-10">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src={logo} alt="Rigabras" className="mb-4 h-20 w-20 rounded-xl shadow-sm" />
          <h1 className="text-2xl font-bold text-slate-900">
            Rig<span className="brand-text-gradient">abras</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Ecossistema Integrado de Gestão Logística (TMS + WMS)
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" data-testid="login-form">
          <label className="flex flex-col gap-1 text-sm text-slate-600">
            E-mail
            <input
              type="email"
              required
              autoComplete="username"
              className="input"
              value={email}
              data-testid="login-email"
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-slate-600">
            Senha
            <input
              type="password"
              required
              autoComplete="current-password"
              className="input"
              value={password}
              data-testid="login-password"
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <div
              role="alert"
              data-testid="login-error"
              className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
            >
              {error}
            </div>
          )}
          <button type="submit" disabled={loading} data-testid="login-submit" className="btn-brand">
            <LogIn className="h-4 w-4" /> {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          Ainda não tem conta?{' '}
          <Link
            to="/registro"
            className="font-medium text-blue-600 hover:opacity-90 transition-all duration-200"
          >
            Cadastre-se
          </Link>
        </p>
      </div>
    </div>
  );
}
