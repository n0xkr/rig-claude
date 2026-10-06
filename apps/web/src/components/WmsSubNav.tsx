import { Link, useLocation } from 'react-router-dom';
import {
  Warehouse,
  PackageCheck,
  Package,
  ClipboardList,
  ClipboardCheck,
  Truck,
  Boxes,
  AlertOctagon,
  Share2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface SubItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

interface ItemSimples {
  to: string;
  label: string;
  icon: LucideIcon;
  exato?: boolean;
}

interface ItemGrupo {
  label: string;
  icon: LucideIcon;
  itens: SubItem[];
}

const ITENS: Array<ItemSimples | ItemGrupo> = [
  { to: '/wms', label: 'Painel', icon: Warehouse, exato: true },
  { to: '/wms/depositantes', label: 'Depositantes', icon: PackageCheck },
  { to: '/wms/produtos', label: 'Produtos', icon: Package },
  { to: '/wms/recebimentos', label: 'Recebimentos', icon: ClipboardList },
  { to: '/wms/expedicoes', label: 'Expedições', icon: Truck },
  { to: '/wms/estoque', label: 'Estoque', icon: Boxes },
  {
    label: 'Checklist',
    icon: ClipboardCheck,
    itens: [{ to: '/wms/checklist/redes', label: 'Redes', icon: Share2 }],
  },
  { to: '/wms/armazem/mapa', label: 'Mapa', icon: Warehouse },
  { to: '/wms/avarias', label: 'Avarias', icon: AlertOctagon },
];

function estaAtivo(pathname: string, to: string, exato?: boolean): boolean {
  return exato ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
}

/**
 * Submenu compartilhado das telas do WMS (Módulo 5): mesma navegação em
 * todas as páginas do módulo, com o item ativo destacado pela rota atual.
 * Itens de grupo (ex.: "Checklist") renderizam um rótulo com sub-links — a
 * hierarquia WMS > Checklist > Redes — sem deixar de ser uma navegação plana
 * de pills.
 */
export function WmsSubNav() {
  const { pathname } = useLocation();

  return (
    <nav
      data-testid="wms-subnav"
      aria-label="Seções do WMS"
      className="mb-6 flex flex-wrap gap-2"
    >
      {ITENS.map((item) => {
        if ('itens' in item) {
          const ativoGrupo = item.itens.some((sub) => estaAtivo(pathname, sub.to));
          return (
            <div
              key={item.label}
              data-testid={`wms-subnav-grupo-${item.label.toLowerCase()}`}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 shadow-sm transition-all duration-200 ${
                ativoGrupo
                  ? 'border-rigabras-500 bg-rigabras-50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <span
                className={`flex items-center gap-2 text-sm font-medium ${
                  ativoGrupo ? 'text-rigabras-700' : 'text-slate-600'
                }`}
              >
                <item.icon className="h-4 w-4" /> {item.label}
              </span>
              <span className="px-0.5 text-slate-300" aria-hidden="true">
                ›
              </span>
              {item.itens.map((sub) => {
                const ativo = estaAtivo(pathname, sub.to);
                return (
                  <Link
                    key={sub.to}
                    to={sub.to}
                    aria-current={ativo ? 'page' : undefined}
                    data-testid={`wms-subnav-${sub.label.toLowerCase()}`}
                    className={`flex items-center gap-2 rounded-lg px-2.5 py-1 text-sm shadow-sm transition-all duration-200 ${
                      ativo
                        ? 'bg-rigabras-500 font-medium text-white'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <sub.icon className="h-4 w-4" /> {sub.label}
                  </Link>
                );
              })}
            </div>
          );
        }

        const ativo = estaAtivo(pathname, item.to, item.exato);
        return (
          <Link
            key={item.to}
            to={item.to}
            aria-current={ativo ? 'page' : undefined}
            className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm shadow-sm transition-all duration-200 ${
              ativo
                ? 'border-rigabras-500 bg-rigabras-500 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:text-slate-900'
            }`}
          >
            <item.icon className="h-4 w-4" /> {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
