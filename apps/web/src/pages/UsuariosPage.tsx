import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Users, Trash2, KeyRound, UserPlus } from 'lucide-react';
import type { UserRole } from '@rigabras/shared';
import { api, ApiError } from '../lib/apiClient.js';
import { LoadingSkeleton, ErrorCard } from '../components/StateViews.js';

interface Usuario {
  id: string;
  email: string;
  nome_completo: string;
  role: UserRole;
  ativo: boolean;
  created_at: string;
}

const ROLES: UserRole[] = ['SUPERADMIN', 'ADMIN', 'OPERADOR', 'PORTARIA', 'VISITANTE'];
const EMPTY_FORM = { nome_completo: '', email: '', password: '', role: 'OPERADOR' as UserRole };

function errMsg(err: unknown): string {
  return err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado';
}

/** Gestão de usuários (criar, alterar papel/status/senha, excluir) — exclusiva de SUPERADMIN. */
export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [avisoErro, setAvisoErro] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ data: Usuario[] }>('/usuarios');
      setUsuarios(res.data);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<unknown>, ok: string): Promise<boolean> {
    setAviso(null);
    setAvisoErro(false);
    try {
      await action();
      setAviso(ok);
      await load();
      return true;
    } catch (err) {
      setAviso(errMsg(err));
      setAvisoErro(true);
      return false;
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (await run(() => api.post('/usuarios', form), 'Usuário criado')) setForm(EMPTY_FORM);
  }

  function trocarSenha(u: Usuario) {
    const password = window.prompt(`Nova senha para ${u.email} (mínimo 8 caracteres):`);
    if (password) void run(() => api.patch(`/usuarios/${u.id}`, { password }), 'Senha alterada');
  }

  function excluir(u: Usuario) {
    if (window.confirm(`Excluir definitivamente ${u.email}?`)) {
      void run(() => api.delete(`/usuarios/${u.id}`), 'Usuário excluído');
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8" data-testid="usuarios-page">
      <div className="mb-6 flex items-center gap-2">
        <Users className="h-6 w-6 text-rigabras-500" />
        <h1 className="text-2xl font-bold text-slate-900">Usuários</h1>
      </div>

      <form
        onSubmit={handleCreate}
        className="mb-6 grid gap-4 rounded-xl border border-slate-200 p-6 md:grid-cols-5 bg-white shadow-sm"
      >
        <input
          className="input"
          placeholder="Nome completo"
          required
          minLength={2}
          value={form.nome_completo}
          onChange={(e) => setForm({ ...form, nome_completo: e.target.value })}
          data-testid="usuario-nome"
        />
        <input
          className="input"
          type="email"
          placeholder="E-mail"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          data-testid="usuario-email"
        />
        <input
          className="input"
          type="password"
          placeholder="Senha (mín. 8)"
          required
          minLength={8}
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          data-testid="usuario-senha"
        />
        <select
          className="input"
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <button
          className="btn-primary flex items-center justify-center gap-2"
          type="submit"
          data-testid="usuario-criar"
        >
          <UserPlus className="h-4 w-4" /> Criar
        </button>
      </form>

      {aviso && (
        <p
          className={`mb-4 text-sm ${avisoErro ? 'text-red-600' : 'text-emerald-700'}`}
          data-testid="usuarios-aviso"
        >
          {aviso}
        </p>
      )}

      {loading ? (
        <LoadingSkeleton />
      ) : error ? (
        <ErrorCard message={error} onRetry={load} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm text-slate-700">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="p-3">Nome</th>
                <th className="p-3">E-mail</th>
                <th className="p-3">Papel</th>
                <th className="p-3">Ativo</th>
                <th className="p-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id} className="border-t border-slate-200">
                  <td className="p-3">{u.nome_completo}</td>
                  <td className="p-3">{u.email}</td>
                  <td className="p-3">
                    <select
                      className="input"
                      value={u.role}
                      onChange={(e) =>
                        void run(
                          () => api.patch(`/usuarios/${u.id}`, { role: e.target.value }),
                          'Papel atualizado',
                        )
                      }
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={u.ativo}
                      onChange={(e) =>
                        void run(
                          () => api.patch(`/usuarios/${u.id}`, { ativo: e.target.checked }),
                          'Status atualizado',
                        )
                      }
                    />
                  </td>
                  <td className="p-3 text-right">
                    <button
                      className="mr-3 text-slate-600 hover:text-slate-900 transition-all duration-200"
                      title="Trocar senha"
                      onClick={() => trocarSenha(u)}
                    >
                      <KeyRound className="inline h-4 w-4" />
                    </button>
                    <button
                      className="text-red-600 hover:text-red-700 transition-all duration-200"
                      title="Excluir"
                      onClick={() => excluir(u)}
                    >
                      <Trash2 className="inline h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
