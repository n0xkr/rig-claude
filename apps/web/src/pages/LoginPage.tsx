import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { ApiError, apiFetch } from '../lib/apiClient.js';

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
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold text-white">Rigabras — Login</h1>
      <p className="mb-6 text-sm text-slate-400">
        Ecossistema Integrado de Gestão Logística (TMS + WMS)
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" data-testid="login-form">
        <label className="flex flex-col gap-1 text-sm text-slate-300">
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
        <label className="flex flex-col gap-1 text-sm text-slate-300">
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
            className="rounded-md border border-red-800 bg-red-950/30 p-3 text-sm text-red-300"
          >
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={loading}
          data-testid="login-submit"
          className="inline-flex items-center justify-center gap-2 rounded-md bg-rigabras-500 px-3 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
        >
          <LogIn className="h-4 w-4" /> {loading ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
