import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { IdCard, Plus, Search } from 'lucide-react';
import { useMotoristasList } from '../hooks/useMotoristas.js';
import { getCurrentUserRole } from '../lib/apiClient.js';
import { LoadingSkeleton, EmptyState, ErrorCard } from '../components/StateViews.js';

function diasAte(data?: string | null): number | null {
  if (!data) return null;
  const alvo = Date.parse(`${data.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(alvo)) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((alvo - hoje.getTime()) / 86_400_000);
}

export default function MotoristasListPage() {
  const role = getCurrentUserRole();
  const podeCriar = role === 'SUPERADMIN' || role === 'ADMIN' || role === 'OPERADOR';
  const { state, motoristas, error, reload } = useMotoristasList();
  const [busca, setBusca] = useState('');
  const [mostrarInativos, setMostrarInativos] = useState(false);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const digitos = q.replace(/\D/g, '');
    return motoristas
      .filter((m) => mostrarInativos || m.ativo)
      .filter(
        (m) =>
          !q ||
          m.nome_completo.toLowerCase().includes(q) ||
          (digitos.length >= 3 && (m.cpf ?? '').replace(/\D/g, '').includes(digitos)) ||
          (m.cnh ?? '').includes(q) ||
          (m.codigo_externo ?? '').toLowerCase().includes(q),
      )
      .sort((a, b) => a.nome_completo.localeCompare(b.nome_completo));
  }, [motoristas, busca, mostrarInativos]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8" data-testid="motoristas-page">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <IdCard className="h-6 w-6 text-blue-600" /> Motoristas
          </h1>
          <p className="text-sm text-slate-500">Cadastro com leitura automática da CNH e documentos dos veículos.</p>
        </div>
        {podeCriar && (
          <Link to="/motoristas/novo" className="btn-brand" data-testid="motorista-novo">
            <Plus className="h-4 w-4" /> Novo motorista
          </Link>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Buscar por nome, CPF, CNH ou código..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} />
          Mostrar inativos
        </label>
      </div>

      {(state === 'loading' || state === 'idle') && <LoadingSkeleton />}
      {state === 'error' && <ErrorCard message={error ?? 'Erro'} onRetry={reload} />}
      {state === 'success' && lista.length === 0 && (
        <EmptyState
          title={motoristas.length === 0 ? 'Nenhum motorista cadastrado' : 'Nada encontrado'}
          description="Cadastre lendo a CNH por foto/PDF ou importe a planilha de motoristas em Importar dados."
        />
      )}
      {state === 'success' && lista.length > 0 && (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white shadow-sm" data-testid="motoristas-lista">
          {lista.map((m) => {
            const dias = diasAte(m.cnh_validade);
            return (
              <li key={m.id}>
                <Link to={`/motoristas/${m.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">
                      {m.nome_completo}
                      {!m.ativo && <span className="ml-2 text-xs text-slate-400">(inativo)</span>}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {[m.cpf && `CPF ${m.cpf}`, m.cnh && `CNH ${m.cnh}`, m.cnh_categoria && `cat. ${m.cnh_categoria}`, m.telefone]
                        .filter(Boolean)
                        .join(' · ') || 'Sem documentos informados'}
                    </p>
                  </div>
                  {dias !== null && (
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                        dias < 0 ? 'bg-red-50 text-red-700' : dias <= 30 ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {dias < 0 ? 'CNH vencida' : dias <= 30 ? `CNH vence em ${dias}d` : 'CNH válida'}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
