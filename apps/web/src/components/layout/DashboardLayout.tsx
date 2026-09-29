import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
  Bot,
  ClipboardCheck,
  Clock,
  Gauge,
  LayoutDashboard,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  Truck,
  UploadCloud,
  Users,
  Wallet,
  Warehouse,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { UserRole } from '@rigabras/shared';
import logo from '../../assets/logo-rigabras.jpg';
import { getCurrentUserRole } from '../../lib/apiClient.js';
import { haptic } from '../../lib/haptics.js';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles?: UserRole[];
}

const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Painel', icon: LayoutDashboard },
  { to: '/viagens', label: 'Viagens', icon: Truck },
  { to: '/rigabras-ai', label: 'RIGABRAS AI', icon: Bot },
  { to: '/portaria', label: 'Portaria', icon: ClipboardCheck },
  { to: '/fronteira/kpis', label: 'KPIs de fronteira', icon: Gauge },
  { to: '/fretes', label: 'Financeiro do frete', icon: Wallet },
  { to: '/frota/kpis', label: 'Frota', icon: Wrench },
  { to: '/jornada', label: 'Jornada', icon: Clock },
  { to: '/wms', label: 'WMS', icon: Warehouse },
  { to: '/exportacoes', label: 'Exportações', icon: UploadCloud },
  { to: '/importar-dados', label: 'Importar dados', icon: UploadCloud },
  { to: '/auditoria', label: 'Auditoria', icon: ShieldCheck, roles: ['SUPERADMIN', 'ADMIN'] },
  { to: '/usuarios', label: 'Usuários', icon: Users, roles: ['SUPERADMIN'] },
];

function isActive(pathname: string, to: string): boolean {
  return pathname === to || (to !== '/dashboard' && pathname.startsWith(`${to}/`));
}

function NavList({
  items,
  collapsed,
  onNavigate,
}: {
  items: NavItem[];
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const { pathname } = useLocation();
  return (
    <nav className="flex flex-col gap-1" aria-label="Navegação principal">
      {items.map(({ to, label, icon: Icon }) => {
        const active = isActive(pathname, to);
        return (
          <Link
            key={to}
            to={to}
            title={label}
            onClick={() => {
              haptic('tap');
              onNavigate?.();
            }}
            className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
              active ? 'text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            {active && (
              <motion.span
                layoutId="nav-active"
                className="absolute inset-0 rounded-xl border border-tms-cyan/30 bg-tms-cyan/10"
                style={{ boxShadow: '0 0 18px rgba(0,242,254,0.18)' }}
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              />
            )}
            <Icon className={`relative h-[18px] w-[18px] shrink-0 ${active ? 'text-tms-cyan' : ''}`} />
            {!collapsed && <span className="relative truncate">{label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Shell do TMS Rigabras: header responsivo, sidebar flutuante em vidro
 * (colapsável no desktop, drawer no mobile), transição de página estilo
 * "troca de câmera" e slots opcionais para viewport 3D central e painéis de
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

  const items = NAV.filter((i) => !i.roles || (role && i.roles.includes(role)));
  const current = items.find((i) => isActive(pathname, i.to));

  function logout() {
    haptic('warning');
    localStorage.removeItem('rigabras_access_token');
    navigate('/login');
  }

  return (
    <div className="relative min-h-screen overflow-x-clip text-slate-100">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            'radial-gradient(1200px 600px at 12% -10%, rgba(0,242,254,0.10), transparent 60%), radial-gradient(900px 500px at 100% 0%, rgba(255,159,67,0.08), transparent 55%), linear-gradient(180deg, #0e1726 0%, #090d16 60%)',
        }}
      />

      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#090d16]/70 backdrop-blur-xl">
        <div className="flex items-center gap-3 px-4 py-3 lg:pl-[calc(var(--sidebar-w)+2rem)]" style={{ ['--sidebar-w' as string]: collapsed ? '4.5rem' : '15rem' }}>
          <button
            type="button"
            className="rounded-lg p-2 text-slate-300 hover:bg-white/5 lg:hidden"
            onClick={() => setDrawer(true)}
            aria-label="Abrir menu"
            data-testid="menu-button"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link to="/dashboard" className="flex items-center gap-2 font-semibold text-white lg:hidden">
            <img src={logo} alt="Rigabras" className="h-7 w-7 shrink-0 rounded-lg object-cover" />
            Rig<span className="text-tms-cyan">abras</span>
          </Link>
          <p className="hidden text-sm font-medium tracking-wide text-slate-300 lg:block">
            {current?.label ?? 'Rigabras TMS'}
          </p>
          <div className="ml-auto flex items-center gap-3">
            <button
              type="button"
              data-testid="logout-button"
              onClick={logout}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-300 hover:bg-white/5 hover:text-white"
              title={`Papel atual: ${role ?? '-'}`}
            >
              <LogOut className="h-4 w-4" /> Sair{role ? ` (${role})` : ""}
            </button>
          </div>
        </div>
      </header>

      {/* Sidebar flutuante (desktop) */}
      <aside
        className="fixed bottom-4 left-4 top-4 z-[45] hidden flex-col rounded-2xl border border-white/10 bg-[#0e1726]/70 p-3 backdrop-blur-xl transition-[width] duration-300 lg:flex"
        style={{
          width: collapsed ? '4.5rem' : '15rem',
          boxShadow: '0 10px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,242,254,0.08), 0 0 40px rgba(0,242,254,0.06)',
        }}
      >
        <Link to="/dashboard" className="mb-4 flex shrink-0 items-center gap-2 px-1 font-semibold text-white">
          <img src={logo} alt="Rigabras" className="aspect-square h-9 w-9 shrink-0 rounded-xl object-cover" />
          {!collapsed && (
            <span>
              Rig<span className="text-tms-cyan">abras</span>
            </span>
          )}
        </Link>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <NavList items={items} collapsed={collapsed} />
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="mt-2 flex shrink-0 items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-500 hover:text-white"
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
          {!collapsed && 'Recolher'}
        </button>
      </aside>

      {/* Drawer (mobile) */}
      <AnimatePresence>
        {drawer && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawer(false)}
            />
            <motion.aside
              className="fixed bottom-3 left-3 top-3 z-50 flex w-64 flex-col rounded-2xl border border-white/10 bg-[#0e1726]/95 p-3 backdrop-blur-xl lg:hidden"
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            >
              <div className="mb-3 flex shrink-0 items-center justify-between px-1">
                <span className="font-semibold text-white">
                  Rig<span className="text-tms-cyan">abras</span>
                </span>
                <button type="button" onClick={() => setDrawer(false)} aria-label="Fechar menu" className="p-1 text-slate-400">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <NavList items={items} collapsed={false} onNavigate={() => setDrawer(false)} />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <main
        className="transition-[padding] duration-300 lg:pl-[calc(var(--sidebar-w)+2rem)]"
        style={{ ['--sidebar-w' as string]: collapsed ? '4.5rem' : '15rem' }}
      >
        {viewport && <section className="px-4 pt-4">{viewport}</section>}
        {telemetry && <section className="px-4 pt-4">{telemetry}</section>}
        <motion.div
          key={pathname}
          initial={reduce ? false : { opacity: 0, scale: 1.02, filter: 'blur(6px)' }}
          animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
        >
          {children}
        </motion.div>
      </main>
    </div>
  );
}
