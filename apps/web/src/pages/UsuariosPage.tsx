import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  KeyRound,
  Pencil,
  Plus,
  ShieldCheck,
  Tags,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  MODULOS,
  resolverPermissoes,
  type CategoriaUsuario,
  type ModuloKey,
  type UserRole,
} from '@rigabras/shared';
import { api, ApiError, getCurrentUserEmail } from '../lib/apiClient.js';
import { LoadingSkeleton, ErrorCard } from '../components/StateViews.js';

interface Usuario {
  id: string;
  email: string;
  nome_completo: string;
  role: UserRole;
  ativo: boolean;
  created_at: string;
  categoria_id: string | null;
  permissoes: ModuloKey[] | null;
}

const ROLES: UserRole[] = ['SUPERADMIN', 'ADMIN', 'OPERADOR', 'PORTARIA', 'VISITANTE'];
const ROLE_DESCRICAO: Record<UserRole, string> = {
  SUPERADMIN: 'Acesso total, inclusive usuários e categorias',
  ADMIN: 'Administra a operação e aprova finanças',
  OPERADOR: 'Lê e registra dados operacionais',
  PORTARIA: 'Registro de entradas na portaria',
  VISITANTE: 'Somente leitura',
};
const TODOS_MODULOS = MODULOS.map((m) => m.key) as ModuloKey[];
const EMPTY_FORM = {
  nome_completo: '',
  email: '',
  password: '',
  role: 'OPERADOR' as UserRole,
  categoria_id: '',
};

function errMsg(err: unknown): string {
  return err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado';
}

function Modal({
  titulo,
  onClose,
  children,
}: {
  titulo: string;
  onClose: () => void;
  children: ReactNode;
}) {
  // Portal no <body>: ancestrais animados (transform) prendem o `position: fixed`.
  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={titulo}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{titulo}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-xl p-1 text-slate-500 transition-all duration-200 hover:bg-slate-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Grade de checkboxes com os módulos do sistema. */
function ModulosPicker({
  value,
  onChange,
  testId,
}: {
  value: ModuloKey[];
  onChange: (mods: ModuloKey[]) => void;
  testId?: string;
}) {
  const marcados = new Set(value);
  return (
    <div data-testid={testId}>
      <div className="mb-2 flex gap-3 text-xs">
        <button
          type="button"
          className="text-rigabras-500 hover:underline"
          onClick={() => onChange(TODOS_MODULOS)}
        >
          Marcar todos
        </button>
        <button
          type="button"
          className="text-slate-500 hover:underline"
          onClick={() => onChange([])}
        >
          Desmarcar todos
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {MODULOS.map((m) => (
          <label
            key={m.key}
            className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
          >
            <input
              type="checkbox"
              checked={marcados.has(m.key)}
              onChange={(e) =>
                onChange(e.target.checked ? [...value, m.key] : value.filter((k) => k !== m.key))
              }
              data-testid={testId ? `${testId}-${m.key}` : undefined}
            />
            {m.label}
          </label>
        ))}
      </div>
    </div>
  );
}

/** Resumo de "onde a pessoa entra" para a tabela. */
function resumoAcesso(u: Usuario, categorias: Map<string, CategoriaUsuario>): string {
  if (u.role === 'SUPERADMIN') return 'Todos os módulos';
  const cat = u.categoria_id ? categorias.get(u.categoria_id) : undefined;
  const efetivas = resolverPermissoes(u.role, u.permissoes, cat?.permissoes ?? null);
  if (efetivas == null) return 'Todos os módulos';
  const origem = u.permissoes != null ? 'Personalizado' : 'Da categoria';
  if (efetivas.length === 0) return `${origem}: nenhum módulo`;
  if (efetivas.length === TODOS_MODULOS.length) return `${origem}: todos os módulos`;
  return `${origem}: ${efetivas.length} de ${TODOS_MODULOS.length} módulos`;
}

function EditarUsuarioModal({
  usuario,
  categorias,
  souEu,
  onClose,
  onSaved,
}: {
  usuario: Usuario;
  categorias: CategoriaUsuario[];
  souEu: boolean;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [nome, setNome] = useState(usuario.nome_completo);
  const [role, setRole] = useState<UserRole>(usuario.role);
  const [ativo, setAtivo] = useState(usuario.ativo);
  const [categoriaId, setCategoriaId] = useState(usuario.categoria_id ?? '');
  const [personalizar, setPersonalizar] = useState(usuario.permissoes != null);
  const categoriaAtual = categorias.find((c) => c.id === categoriaId);
  const [mods, setMods] = useState<ModuloKey[]>(
    usuario.permissoes ?? (categoriaAtual?.permissoes as ModuloKey[] | undefined) ?? TODOS_MODULOS,
  );
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    const payload: Record<string, unknown> = {};
    if (nome.trim() !== usuario.nome_completo) payload.nome_completo = nome.trim();
    if (!souEu && role !== usuario.role) payload.role = role;
    if (!souEu && ativo !== usuario.ativo) payload.ativo = ativo;
    if ((categoriaId || null) !== usuario.categoria_id) payload.categoria_id = categoriaId || null;
    const novasPermissoes = personalizar ? mods : null;
    if (JSON.stringify(novasPermissoes) !== JSON.stringify(usuario.permissoes)) {
      payload.permissoes = novasPermissoes;
    }
    if (senha) payload.password = senha;
    if (Object.keys(payload).length === 0) {
      onClose();
      return;
    }
    try {
      await api.patch(`/usuarios/${usuario.id}`, payload);
      onSaved('Usuário atualizado. As permissões valem a partir do próximo acesso dele.');
    } catch (err) {
      setErro(errMsg(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal titulo={`Editar ${usuario.email}`} onClose={onClose}>
      <form onSubmit={salvar} className="grid gap-4" data-testid="usuario-editar-form">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-slate-500">
            Nome completo
            <input
              className="input mt-1"
              required
              minLength={2}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              data-testid="ue-nome"
            />
          </label>
          <label className="block text-xs text-slate-500">
            Papel {souEu && '(não é possível alterar o próprio)'}
            <select
              className="input mt-1"
              value={role}
              disabled={souEu}
              onChange={(e) => setRole(e.target.value as UserRole)}
              data-testid="ue-role"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r} — {ROLE_DESCRICAO[r]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-slate-500">
            Categoria
            <select
              className="input mt-1"
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              data-testid="ue-categoria"
            >
              <option value="">Sem categoria</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-slate-500">
            Nova senha (opcional)
            <input
              className="input mt-1"
              type="password"
              minLength={8}
              placeholder="Deixe em branco para manter"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="new-password"
            />
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={ativo}
            disabled={souEu}
            onChange={(e) => setAtivo(e.target.checked)}
          />
          Conta ativa (pode fazer login)
        </label>

        <fieldset className="rounded-xl border border-slate-200 p-4">
          <legend className="px-1 text-sm font-medium text-slate-900">Permissões por módulo</legend>
          {role === 'SUPERADMIN' ? (
            <p className="text-sm text-slate-500">SUPERADMIN tem acesso a todos os módulos.</p>
          ) : (
            <>
              <div className="mb-3 flex flex-col gap-2 text-sm text-slate-700">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={!personalizar}
                    onChange={() => setPersonalizar(false)}
                  />
                  {categoriaAtual
                    ? `Usar as permissões da categoria "${categoriaAtual.nome}"`
                    : 'Sem restrição (todos os módulos, conforme o papel)'}
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={personalizar}
                    onChange={() => setPersonalizar(true)}
                    data-testid="ue-personalizar"
                  />
                  Personalizar para este usuário
                </label>
              </div>
              {personalizar && <ModulosPicker value={mods} onChange={setMods} testId="ue-mod" />}
            </>
          )}
        </fieldset>

        {erro && <p className="text-sm text-red-600">{erro}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 shadow-sm transition-all duration-200 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button type="submit" disabled={salvando} className="btn-primary" data-testid="ue-salvar">
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CategoriaModal({
  categoria,
  onClose,
  onSaved,
}: {
  categoria: CategoriaUsuario | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [nome, setNome] = useState(categoria?.nome ?? '');
  const [descricao, setDescricao] = useState(categoria?.descricao ?? '');
  const [mods, setMods] = useState<ModuloKey[]>(
    (categoria?.permissoes as ModuloKey[] | undefined) ?? [],
  );
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    const payload = { nome: nome.trim(), descricao: descricao.trim(), permissoes: mods };
    try {
      if (categoria) await api.patch(`/categorias-usuario/${categoria.id}`, payload);
      else await api.post('/categorias-usuario', payload);
      onSaved(categoria ? 'Categoria atualizada' : 'Categoria criada');
    } catch (err) {
      setErro(errMsg(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo={categoria ? `Editar categoria ${categoria.nome}` : 'Nova categoria'}
      onClose={onClose}
    >
      <form onSubmit={salvar} className="grid gap-4" data-testid="categoria-form">
        <label className="block text-xs text-slate-500">
          Nome
          <input
            className="input mt-1"
            required
            minLength={2}
            maxLength={80}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Financeiro, Portaria noturna"
            data-testid="cat-nome"
          />
        </label>
        <label className="block text-xs text-slate-500">
          Descrição (opcional)
          <input
            className="input mt-1"
            maxLength={500}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
          />
        </label>
        <div>
          <p className="mb-2 text-sm font-medium text-slate-900">Módulos liberados</p>
          <ModulosPicker value={mods} onChange={setMods} testId="cat-mod" />
        </div>
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-600 shadow-sm transition-all duration-200 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando}
            className="btn-primary"
            data-testid="cat-salvar"
          >
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Gestão de usuários (criar, editar papel/categoria/permissões/status/senha,
 * excluir) e das categorias de usuário — exclusiva de SUPERADMIN.
 */
export default function UsuariosPage() {
  const [aba, setAba] = useState<'usuarios' | 'categorias'>('usuarios');
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [categorias, setCategorias] = useState<CategoriaUsuario[]>([]);
  const [categoriasErro, setCategoriasErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [avisoErro, setAvisoErro] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [categoriaModal, setCategoriaModal] = useState<CategoriaUsuario | 'nova' | null>(null);
  const meuEmail = getCurrentUserEmail()?.toLowerCase() ?? null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [resUsuarios, resCategorias] = await Promise.all([
        api.get<{ data: Usuario[] }>('/usuarios'),
        api
          .get<{ data: CategoriaUsuario[] }>('/categorias-usuario')
          .then((r) => ({ ok: true as const, data: r.data }))
          .catch((err: unknown) => ({ ok: false as const, erro: errMsg(err) })),
      ]);
      setUsuarios(resUsuarios.data);
      if (resCategorias.ok) {
        setCategorias(resCategorias.data);
        setCategoriasErro(null);
      } else {
        setCategorias([]);
        setCategoriasErro(resCategorias.erro);
      }
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const categoriasPorId = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias]);

  function avisar(msg: string, erro = false) {
    setAviso(msg);
    setAvisoErro(erro);
  }

  async function run(action: () => Promise<unknown>, ok: string): Promise<boolean> {
    setAviso(null);
    try {
      await action();
      avisar(ok);
      await load();
      return true;
    } catch (err) {
      avisar(errMsg(err), true);
      return false;
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const payload = {
      nome_completo: form.nome_completo,
      email: form.email,
      password: form.password,
      role: form.role,
      ...(form.categoria_id ? { categoria_id: form.categoria_id } : {}),
    };
    if (await run(() => api.post('/usuarios', payload), 'Usuário criado')) setForm(EMPTY_FORM);
  }

  function trocarSenha(u: Usuario) {
    const password = window.prompt(`Nova senha para ${u.email} (mínimo 8 caracteres):`);
    if (!password) return;
    if (password.length < 8) {
      avisar('A senha precisa ter ao menos 8 caracteres', true);
      return;
    }
    void run(() => api.patch(`/usuarios/${u.id}`, { password }), 'Senha alterada');
  }

  async function excluir(u: Usuario) {
    if (!window.confirm(`Excluir ${u.email}? A pessoa perde o acesso ao sistema.`)) return;
    setAviso(null);
    try {
      const res = await api.delete<{ modo: 'definitiva' | 'logica' }>(`/usuarios/${u.id}`);
      avisar(
        res?.modo === 'logica'
          ? 'Usuário excluído. Como ele tinha registros no histórico, a conta foi bloqueada e mantida só para auditoria.'
          : 'Usuário excluído',
      );
      await load();
    } catch (err) {
      avisar(errMsg(err), true);
    }
  }

  function excluirCategoria(c: CategoriaUsuario) {
    const extra = c.total_usuarios
      ? ` ${c.total_usuarios} usuário(s) ficarão sem categoria (acesso volta a seguir só o papel).`
      : '';
    if (!window.confirm(`Excluir a categoria "${c.nome}"?${extra}`)) return;
    void run(() => api.delete(`/categorias-usuario/${c.id}`), 'Categoria excluída');
  }

  const abaClasse = (ativa: boolean) =>
    `flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 ${
      ativa ? 'bg-rigabras-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
    }`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8" data-testid="usuarios-page">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="h-6 w-6 text-rigabras-500" />
          <h1 className="text-2xl font-bold text-slate-900">Usuários e permissões</h1>
        </div>
        <div className="flex gap-2" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={aba === 'usuarios'}
            className={abaClasse(aba === 'usuarios')}
            onClick={() => setAba('usuarios')}
            data-testid="aba-usuarios"
          >
            <Users className="h-4 w-4" /> Usuários
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={aba === 'categorias'}
            className={abaClasse(aba === 'categorias')}
            onClick={() => setAba('categorias')}
            data-testid="aba-categorias"
          >
            <Tags className="h-4 w-4" /> Categorias
          </button>
        </div>
      </div>

      {aviso && (
        <p
          className={`mb-4 text-sm ${avisoErro ? 'text-red-600' : 'text-emerald-700'}`}
          data-testid="usuarios-aviso"
        >
          {aviso}
        </p>
      )}

      {categoriasErro && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Categorias indisponíveis: {categoriasErro}
        </p>
      )}

      {loading ? (
        <LoadingSkeleton />
      ) : error ? (
        <ErrorCard message={error} onRetry={load} />
      ) : aba === 'usuarios' ? (
        <>
          <form
            onSubmit={handleCreate}
            className="mb-6 grid gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-3 lg:grid-cols-6"
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
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              data-testid="usuario-senha"
            />
            <select
              className="input"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
              title={ROLE_DESCRICAO[form.role]}
              data-testid="usuario-role"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <select
              className="input"
              value={form.categoria_id}
              onChange={(e) => setForm({ ...form, categoria_id: e.target.value })}
              disabled={categorias.length === 0}
              data-testid="usuario-categoria"
            >
              <option value="">Sem categoria</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
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

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="p-3">Nome</th>
                  <th className="p-3">E-mail</th>
                  <th className="p-3">Papel</th>
                  <th className="p-3">Categoria</th>
                  <th className="p-3">Acesso</th>
                  <th className="p-3">Ativo</th>
                  <th className="p-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => {
                  const souEu = u.email.toLowerCase() === meuEmail;
                  return (
                    <tr
                      key={u.id}
                      className="border-t border-slate-200"
                      data-testid="usuario-linha"
                    >
                      <td className="p-3">
                        {u.nome_completo}
                        {souEu && <span className="ml-2 text-xs text-slate-400">(você)</span>}
                      </td>
                      <td className="p-3">{u.email}</td>
                      <td className="p-3">
                        <select
                          className="input"
                          value={u.role}
                          disabled={souEu}
                          title={ROLE_DESCRICAO[u.role]}
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
                        <select
                          className="input"
                          value={u.categoria_id ?? ''}
                          disabled={categorias.length === 0}
                          onChange={(e) =>
                            void run(
                              () =>
                                api.patch(`/usuarios/${u.id}`, {
                                  categoria_id: e.target.value || null,
                                }),
                              'Categoria atualizada',
                            )
                          }
                        >
                          <option value="">Sem categoria</option>
                          {categorias.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.nome}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-3 text-xs text-slate-500">
                        {resumoAcesso(u, categoriasPorId)}
                      </td>
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={u.ativo}
                          disabled={souEu}
                          onChange={(e) =>
                            void run(
                              () => api.patch(`/usuarios/${u.id}`, { ativo: e.target.checked }),
                              'Status atualizado',
                            )
                          }
                        />
                      </td>
                      <td className="whitespace-nowrap p-3 text-right">
                        <button
                          className="mr-3 text-slate-600 transition-all duration-200 hover:text-slate-900"
                          title="Editar usuário e permissões"
                          onClick={() => setEditando(u)}
                          data-testid="usuario-editar"
                        >
                          <Pencil className="inline h-4 w-4" />
                        </button>
                        <button
                          className="mr-3 text-slate-600 transition-all duration-200 hover:text-slate-900"
                          title="Trocar senha"
                          onClick={() => trocarSenha(u)}
                        >
                          <KeyRound className="inline h-4 w-4" />
                        </button>
                        {!souEu && (
                          <button
                            className="text-red-600 transition-all duration-200 hover:text-red-700"
                            title="Excluir"
                            onClick={() => void excluir(u)}
                            data-testid="usuario-excluir"
                          >
                            <Trash2 className="inline h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-2xl text-sm text-slate-500">
              Categorias agrupam os módulos que um usuário pode acessar. O papel continua definindo
              o que ele pode fazer dentro de cada módulo (ler, registrar, aprovar). Usuários sem
              categoria acessam todos os módulos permitidos pelo papel.
            </p>
            <button
              type="button"
              className="btn-primary flex items-center gap-2"
              onClick={() => setCategoriaModal('nova')}
              disabled={categoriasErro != null}
              data-testid="categoria-nova"
            >
              <Plus className="h-4 w-4" /> Nova categoria
            </button>
          </div>
          {categorias.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">
              Nenhuma categoria criada ainda.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {categorias.map((c) => (
                <div
                  key={c.id}
                  className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                  data-testid="categoria-card"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="flex items-center gap-2 font-semibold text-slate-900">
                        <ShieldCheck className="h-4 w-4 text-rigabras-500" /> {c.nome}
                      </h3>
                      {c.descricao && <p className="mt-1 text-sm text-slate-500">{c.descricao}</p>}
                      <p className="mt-1 text-xs text-slate-400">
                        {c.total_usuarios ?? 0} usuário(s)
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-3">
                      <button
                        className="text-slate-600 transition-all duration-200 hover:text-slate-900"
                        title="Editar categoria"
                        onClick={() => setCategoriaModal(c)}
                        data-testid="categoria-editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        className="text-red-600 transition-all duration-200 hover:text-red-700"
                        title="Excluir categoria"
                        onClick={() => excluirCategoria(c)}
                        data-testid="categoria-excluir"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {c.permissoes.length === 0 ? (
                      <span className="text-xs text-slate-400">Nenhum módulo liberado</span>
                    ) : (
                      MODULOS.filter((m) => c.permissoes.includes(m.key)).map((m) => (
                        <span
                          key={m.key}
                          className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                        >
                          {m.label}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {editando && (
        <EditarUsuarioModal
          usuario={editando}
          categorias={categorias}
          souEu={editando.email.toLowerCase() === meuEmail}
          onClose={() => setEditando(null)}
          onSaved={(msg) => {
            setEditando(null);
            avisar(msg);
            void load();
          }}
        />
      )}
      {categoriaModal && (
        <CategoriaModal
          categoria={categoriaModal === 'nova' ? null : categoriaModal}
          onClose={() => setCategoriaModal(null)}
          onSaved={(msg) => {
            setCategoriaModal(null);
            avisar(msg);
            void load();
          }}
        />
      )}
    </div>
  );
}
