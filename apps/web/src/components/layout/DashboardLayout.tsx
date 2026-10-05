import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Bot,
  ClipboardCheck,
  Clock,
  IdCard,
  Gauge,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Radar,
  Sparkles,
  ShieldCheck,
  Truck,
  UploadCloud,
  Users,
  Database,
  Wallet,
  Warehouse,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { ModuloKey, UserRole } from '@rigabras/shared';
import logo from '../../assets/logo-rigabras.jpg';
import type { Perfil } from '@rigabras/shared';
import { api, getCurrentUserId, getCurrentUserRole } from '../../lib/apiClient.js';
import { useResumoSolicitacoesIa } from '../../hooks/useSolicitacoesIa.js';
import { haptic } from '../../lib/haptics.js';
import { podeAcessar } from '../../lib/permissoes.js';
import { ThemeToggle } from '../theme/ThemeToggle.js';
import { OfflineQueueIndicator } from './OfflineQueueIndicator.js';
import { purgeQueueDoUsuario } from '../../offline/db.js';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles?: UserRole[];
  /** Módulo exigido (categorias/permissões do usuário). */
  modulo?: ModuloKey;
  /** Só aparece para quem a API autoriza (ex.: Auditoria restrita ao proprietário). */
  exigeAuditoria?: boolean;
  /** Mostra o contador de solicitações pendentes da IA. */
  badge?: 'solicitacoes';
}

const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Painel', icon: LayoutDashboard, modulo: 'painel' },
  { to: '/viagens', label: 'Viagens', icon: Truck, modulo: 'viagens' },
  { to: '/motoristas', label: 'Motoristas', icon: IdCard, modulo: 'motoristas' },
  { to: '/rigabras-ai', label: 'RIGABRAS AI', icon: Bot, modulo: 'rigabras_ai' },
  { to: '/portaria', label: 'Portaria', icon: ClipboardCheck, modulo: 'portaria' },
  { to: '/fronteira/kpis', label: 'KPIs de fronteira', icon: Gauge, modulo: 'fronteira' },
  { to: '/fretes', label: 'Financeiro do frete', icon: Wallet, modulo: 'fretes' },
  { to: '/acompanhamento', label: 'Acompanhamento', icon: Radar, modulo: 'acompanhamento' },
  { to: '/frota/kpis', label: 'Frota', icon: Wrench, modulo: 'frota' },
  { to: '/jornada', label: 'Jornada', icon: Clock, modulo: 'jornada' },
  { to: '/wms', label: 'WMS', icon: Warehouse, modulo: 'wms' },
  { to: '/exportacoes', label: 'Exportações', icon: UploadCloud, modulo: 'exportacoes' },
  { to: '/importar-dados', label: 'Importar dados', icon: UploadCloud, modulo: 'importacao' },
  {
    to: '/solicitacoes-ia',
    label: 'Solicitações da IA',
    icon: Sparkles,
    roles: ['SUPERADMIN', 'ADMIN'],
    badge: 'solicitacoes',
    modulo: 'solicitacoes_ia',
  },
  { to: '/auditoria', label: 'Auditoria', icon: ShieldCheck, exigeAuditoria: true },
  { to: '/usuarios', label: 'Usuários', icon: Users, roles: ['SUPERADMIN'] },
  { to: '/gerenciar-dados', label: 'Gerenciar dados', icon: Database, roles: ['SUPERADMIN'] },
];

function isActive(pathname: string, to: string): boolean {
  return pathname === to || (to !== '/dashboard' && pathname.startsWith(`${to}/`));
}

function NavList({
  items,
  collapsed,
  onNavigate,
  badges = {},
}: {
  items: NavItem[];
  collapsed: boolean;
  onNavigate?: () => void;
  badges?: Partial<Record<NonNullable<NavItem['badge']>, number>>;
}) {
  const { pathname } = useLocation();
  return (
    <nav className="flex flex-col gap-1" aria-label="Navegação principal">
      {items.map(({ to, label, icon: Icon, badge }) => {
        const active = isActive(pathname, to);
        const contagem = badge ? (badges[badge] ?? 0) : 0;
        return (
          <Link
            key={to}
            to={to}
            title={label}
            aria-label={collapsed ? label : undefined}
            aria-current={active ? 'page' : undefined}
            onClick={() => {
              haptic('tap');
              onNavigate?.();
            }}
            className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
              active ? 'text-blue-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
            } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}
          >
            {active && (
              <motion.span
                layoutId="nav-active"
                className="absolute inset-0 rounded-xl bg-blue-50"
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              />
            )}
            <Icon
              className={`relative h-[18px] w-[18px] shrink-0 ${active ? 'text-blue-600' : ''}`}
            />
            {!collapsed && <span className="relative truncate">{label}</span>}
            {contagem > 0 && (
              <span
                data-testid="nav-badge-solicitacoes"
                role="status"
                aria-label={`${contagem} pendentes`}
                className={`relative rounded-full bg-blue-600 px-1.5 text-[10px] font-bold leading-4 text-white ${
                  collapsed ? 'absolute right-1 top-1' : 'ml-auto'
                }`}
              >
                {contagem > 99 ? '99+' : contagem}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Shell do TMS Rigabras: header responsivo, sidebar flutuante em card
 * (colapsável no desktop, drawer no mobile), transição de página suave e slots opcionais para viewport 3D central e painéis de
 * telemetria acima do conteúdo da rota.
 */
export function DashboardLayout({
  children,
  viewport,
  telemetry,
}: {
  children: ReactNode;
  /** Viewport 3D central (ex: <FleetNodeChart3D/>). */
  viewport?: ReactNode;
  /** Painéis de telemetria (ex: GlassCards com KPIs). */
  telemetry?: ReactNode;
}) {
  const role = getCurrentUserRole();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const reduce = useReducedMotion();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => setDrawer(false), [pathname]);

  // Esc fecha o menu lateral (mobile).
  useEffect(() => {
    if (!drawer) return undefined;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawer(false);
    };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [drawer]);

  const [perfil, setPerfil] = useState<Perfil | null>(null);
  useEffect(() => {
    let ativo = true;
    api
      .get<Perfil>('/perfil')
      .then((p) => ativo && setPerfil(p))
      .catch(() => undefined);
    const aoAtualizar = (e: Event) =>
      setPerfil((atual) => ({
        ...(atual ?? ({} as Perfil)),
        ...(e as CustomEvent<Perfil>).detail,
      }));
    window.addEventListener('rigabras:perfil-atualizado', aoAtualizar);
    return () => {
      ativo = false;
      window.removeEventListener('rigabras:perfil-atualizado', aoAtualizar);
    };
  }, []);

  const podeDecidirIa =
    (role === 'SUPERADMIN' || role === 'ADMIN') && podeAcessar('solicitacoes_ia');
  const { resumo } = useResumoSolicitacoesIa({ pollMs: podeDecidirIa ? 30000 : 0 });
  const badges = { solicitacoes: podeDecidirIa ? (resumo?.pendentes ?? 0) : 0 };

  const items = NAV.filter(
    (i) =>
      (!i.roles || (role && i.roles.includes(role))) &&
      (!i.modulo || podeAcessar(i.modulo)) &&
      (!i.exigeAuditoria || perfil?.pode_ver_auditoria === true),
  );
  const current = items.find((i) => isActive(pathname, i.to));

  function logout() {
    haptic('warning');
    // Captura o dono antes de apagar o token: a fila só é purgada do usuário
    // que sai, preservando mutações offline de contas diferentes no mesmo browser.
    const uid = getCurrentUserId();
    localStorage.removeItem('rigabras_access_token');
    // Mutações não sincronizadas são descartadas junto com a sessão: sair com
    // trabalho offline pendente é decisão consciente, e deixar payload de outro
    // usuário no browser não é aceitável.
    void purgeQueueDoUsuario(uid).catch(() => undefined);
    // Descarta respostas da API guardadas pelo service worker: o próximo usuário deste
    // navegador não pode enxergar dados do anterior (ex.: motoristas, fretes) offline.
    if ('caches' in window) {
      void caches
        .keys()
        .then((keys) =>
          Promise.all(keys.filter((k) => k.includes('api')).map((k) => caches.delete(k))),
        )
        .catch(() => undefined);
    }
    // Apaga o cookie httpOnly do refresh token no servidor (senão a sessão seguia renovável).
    void api.post('/auth/logout').catch(() => undefined);
    navigate('/login');
  }

  return (
    <div className="relative min-h-screen overflow-x-clip text-slate-900">
      <a
        href="#conteudo"
        className="sr-only z-[60] rounded-lg bg-white px-3 py-2 text-sm font-medium text-blue-700 shadow focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Pular para o conteúdo
      </a>
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-canvas" />

      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div
          className="flex items-center gap-3 px-4 py-3 lg:pl-[calc(var(--sidebar-w)+2rem)]"
          style={{ ['--sidebar-w' as string]: collapsed ? '4.5rem' : '15rem' }}
        >
          <button
            type="button"
            className="rounded-xl p-2 text-slate-600 hover:bg-slate-50 lg:hidden transition-all duration-200"
            onClick={() => setDrawer(true)}
            aria-label="Abrir menu"
            data-testid="menu-button"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link
            to="/dashboard"
            className="flex items-center gap-2 font-semibold text-slate-900 lg:hidden"
          >
            <img src={logo} alt="Rigabras" className="h-7 w-7 shrink-0 rounded-lg object-cover" />
            <span>
              Rig<span className="text-blue-600">abras</span>
            </span>
          </Link>
          <p className="hidden text-sm font-semibold text-slate-900 lg:block">
            {current?.label ?? 'Rigabras TMS'}
          </p>
          <div className="ml-auto flex items-center gap-3">
            <OfflineQueueIndicator />
            <ThemeToggle />
            <Link
              to="/perfil"
              data-testid="perfil-link"
              title="Meu perfil"
              aria-label="Meu perfil"
              className="flex items-center gap-2 rounded-xl px-1.5 py-1 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-all duration-200"
            >
              {perfil?.avatar_url ? (
                <img
                  src={perfil.avatar_url}
                  alt=""
                  className="h-7 w-7 rounded-full border border-white/10 object-cover"
                />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-xs font-semibold text-blue-600">
                  {(perfil?.nome_completo ?? '?').trim().charAt(0).toUpperCase() || '?'}
                </span>
              )}
              <span className="hidden max-w-[10rem] truncate sm:inline">
                {perfil?.nome_completo?.split(' ')[0] ?? ''}
              </span>
            </Link>
            <button
              type="button"
              data-testid="logout-button"
              onClick={logout}
              className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-all duration-200"
            >
              <LogOut className="h-4 w-4" /> Sair
              {role && <span className="hidden text-slate-400 sm:inline">({role})</span>}
            </button>
          </div>
        </div>
      </header>

      {/* Sidebar flutuante (desktop) */}
      <aside
        className="fixed bottom-4 left-4 top-4 z-[45] hidden flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-[width] duration-300 lg:flex"
        style={{ width: collapsed ? '4.5rem' : '15rem' }}
      >
        <Link
          to="/dashboard"
          className="mb-4 flex shrink-0 items-center gap-2 px-1 font-semibold text-slate-900"
        >
          <img
            src={logo}
            alt="Rigabras"
            className="aspect-square h-9 w-9 shrink-0 rounded-xl object-cover"
          />
          {!collapsed && (
            <span>
              Rig<span className="text-blue-600">abras</span>
            </span>
          )}
        </Link>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <NavList items={items} collapsed={collapsed} badges={badges} />
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="mt-2 flex shrink-0 items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-500 hover:text-slate-900 transition-all duration-200"
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          aria-expanded={!collapsed}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-[18px] w-[18px]" />
          ) : (
            <PanelLeftClose className="h-[18px] w-[18px]" />
          )}
          {!collapsed && 'Recolher'}
        </button>
      </aside>

      {/* Drawer (mobile) */}
      <AnimatePresence>
        {drawer && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawer(false)}
            />
            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-label="Menu de navegação"
              className="fixed bottom-3 left-3 top-3 z-50 flex w-64 flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-xl lg:hidden"
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            >
              <div className="mb-3 flex shrink-0 items-center justify-between px-1">
                <span className="font-semibold text-slate-900">
                  Rig<span className="text-blue-600">abras</span>
                </span>
                <button
                  type="button"
                  onClick={() => setDrawer(false)}
                  aria-label="Fechar menu"
                  autoFocus
                  className="rounded-xl p-1 text-slate-500 transition-all duration-200 hover:bg-slate-50 hover:text-slate-900"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <NavList
                  items={items}
                  collapsed={false}
                  onNavigate={() => setDrawer(false)}
                  badges={badges}
                />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <main
        id="conteudo"
        tabIndex={-1}
        className="outline-none transition-[padding] duration-300 lg:pl-[calc(var(--sidebar-w)+2rem)]"
        style={{ ['--sidebar-w' as string]: collapsed ? '4.5rem' : '15rem' }}
      >
        {viewport && <section className="px-4 pt-4">{viewport}</section>}
        {telemetry && <section className="px-4 pt-4">{telemetry}</section>}
        <motion.div
          key={pathname}
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
}
