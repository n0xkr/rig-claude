import { Link, useLocation } from 'react-router-dom';
import {
  Warehouse,
  PackageCheck,
  Package,
  ClipboardList,
  Truck,
  Boxes,
  AlertOctagon,
  Share2,
} from 'lucide-react';

const ITENS = [
  { to: '/wms', label: 'Painel', icon: Warehouse, exato: true },
  { to: '/wms/depositantes', label: 'Depositantes', icon: PackageCheck },
  { to: '/wms/produtos', label: 'Produtos', icon: Package },
  { to: '/wms/recebimentos', label: 'Recebimentos', icon: ClipboardList },
  { to: '/wms/expedicoes', label: 'Expedições', icon: Truck },
  { to: '/wms/estoque', label: 'Estoque', icon: Boxes },
  { to: '/wms/redes', label: 'Redes', icon: Share2 },
  { to: '/wms/armazem/mapa', label: 'Mapa', icon: Warehouse },
  { to: '/wms/avarias', label: 'Avarias', icon: AlertOctagon },
];

/**
 * Submenu compartilhado das telas do WMS (Módulo 5): mesma navegação em
 * todas as páginas do módulo, com o item ativo destacado pela rota atual.
 */
export function WmsSubNav() {
  const { pathname } = useLocation();

  return (
    <nav
      data-testid="wms-subnav"
      aria-label="Seções do WMS"
      className="mb-6 flex flex-wrap gap-2"
    >
      {ITENS.map(({ to, label, icon: Icon, exato }) => {
        const ativo = exato ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
        return (
          <Link
            key={to}
            to={to}
            aria-current={ativo ? 'page' : undefined}
            className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm shadow-sm transition-all duration-200 ${
              ativo
                ? 'border-rigabras-500 bg-rigabras-500 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:text-slate-900'
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
          </Link>
        );
      })}
    </nav>
  );
}
