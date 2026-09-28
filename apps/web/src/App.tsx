import { Route, Routes, Link, useNavigate, useLocation } from 'react-router-dom';
import {
  Gauge,
  Wallet,
  Wrench,
  Clock,
  Warehouse,
  UploadCloud,
  LogOut,
  LayoutDashboard,
  ClipboardCheck,
  Bot,
  ShieldCheck,
} from 'lucide-react';
import { AuthGate } from './components/AuthGate.js';
import { getCurrentUserRole } from './lib/apiClient.js';
import logo from './assets/logo-rigabras.jpg';
import LoginPage from './pages/LoginPage.js';
import RegisterPage from './pages/RegisterPage.js';
import DashboardPage from './pages/DashboardPage.js';
import ViagensListPage from './pages/ViagensListPage.js';
import ViagemFormPage from './pages/ViagemFormPage.js';
import ViagemDetailPage from './pages/ViagemDetailPage.js';
import FronteiraTravessiaPage from './pages/FronteiraTravessiaPage.js';
import FronteiraKpiPage from './pages/FronteiraKpiPage.js';
import ValidacaoPage from './pages/ValidacaoPage.js';
import ViagemFechamentoPage from './pages/ViagemFechamentoPage.js';
import FreteDetailPage from './pages/FreteDetailPage.js';
import FretesListPage from './pages/FretesListPage.js';
import FrotaKpiPage from './pages/FrotaKpiPage.js';
import ManutencoesListPage from './pages/ManutencoesListPage.js';
import ManutencaoFormPage from './pages/ManutencaoFormPage.js';
import ManutencaoDetailPage from './pages/ManutencaoDetailPage.js';
import JornadaRegistroPage from './pages/JornadaRegistroPage.js';
import JornadaAlertasPage from './pages/JornadaAlertasPage.js';
import JornadaHistoricoPage from './pages/JornadaHistoricoPage.js';
import WmsKpiPage from './pages/WmsKpiPage.js';
import DepositantesListPage from './pages/DepositantesListPage.js';
import DepositanteFormPage from './pages/DepositanteFormPage.js';
import ProdutosListPage from './pages/ProdutosListPage.js';
import RastreioProdutoPage from './pages/RastreioProdutoPage.js';
import ArmazemMapaPage from './pages/ArmazemMapaPage.js';
import RecebimentosListPage from './pages/RecebimentosListPage.js';
import RecebimentoFormPage from './pages/RecebimentoFormPage.js';
import RecebimentoDetailPage from './pages/RecebimentoDetailPage.js';
import ExpedicoesListPage from './pages/ExpedicoesListPage.js';
import ExpedicaoFormPage from './pages/ExpedicaoFormPage.js';
import ExpedicaoDetailPage from './pages/ExpedicaoDetailPage.js';
import AvariasListPage from './pages/AvariasListPage.js';
import ExportacoesPage from './pages/ExportacoesPage.js';
import PortariaEntradasListPage from './pages/PortariaEntradasListPage.js';
import PortariaEntradaFormPage from './pages/PortariaEntradaFormPage.js';
import PortariaEntradaDetailPage from './pages/PortariaEntradaDetailPage.js';
import ImportarDadosPage from './pages/ImportarDadosPage.js';
import RigabrasAiPage from './pages/RigabrasAiPage.js';
import AuditoriaListPage from './pages/AuditoriaListPage.js';

function LogoutButton() {
  const navigate = useNavigate();
  const role = getCurrentUserRole();
  if (!role) return null;
  return (
    <button
      type="button"
      data-testid="logout-button"
      onClick={() => {
        localStorage.removeItem('rigabras_access_token');
        navigate('/login');
      }}
      className="flex items-center gap-2 text-sm text-slate-300 hover:text-white"
      title={`Papel atual: ${role}`}
    >
      <LogOut className="h-4 w-4" /> Sair ({role})
    </button>
  );
}

export default function App() {
  const location = useLocation();
  const isPublicRoute = location.pathname === '/login' || location.pathname === '/registro';
  const role = getCurrentUserRole();
  const isAdmin = role === 'SUPERADMIN' || role === 'ADMIN';

  return (
    <div className="min-h-screen bg-slate-950">
      {!isPublicRoute && (
        <header className="border-b border-white/10 bg-slate-950/80 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-3">
            <Link to="/dashboard" className="flex items-center gap-2 font-semibold text-white">
              <img src={logo} alt="Rigabras" className="h-7 w-7 rounded-lg shadow-glow-green" />
              Rig<span className="brand-text-gradient">abras</span>
            </Link>
            <Link
              to="/dashboard"
              className="flex items-center gap-2 text-sm text-slate-300 hover:text-white"
            >
              <LayoutDashboard className="h-4 w-4" /> Painel
            </Link>
            <Link
              to="/rigabras-ai"
              className="flex items-center gap-2 text-sm text-slate-300 hover:text-white"
            >
              <Bot className="h-4 w-4" /> RIGABRAS AI
            </Link>
            <Link
              to="/portaria"
              className="flex items-center gap-2 text-sm text-slate-300 hover:text-white"
            >
              <ClipboardCheck className="h-4 w-4" /> Portaria
            </Link>
            <Link
              to="/fronteira/kpis"
              className="flex items-center gap-2 text-sm text-slate-300 hover:text-white"
            >
              <Gauge className="h-4 w-4" /> KPIs de fronteira
            </Link>
            <Link
              to="/fretes"
              className="flex items-center gap-2 text-sm text-slate-300 hover:text-white"
            >
              <Wallet className="h-4 w-4" /> Financeiro do frete
            </Link>
            <Link
              to="/frota/kpis"
              className="flex items-center gap-2 text-sm text-slate-300 hover:text-white"
            >
              <Wrench className="h-4 w-4" /> Frota
            </Link>
            <Link
              to="/jornada"
              className="flex items-center gap-2 text-sm text-slate-300 hover:text-white"
            >
              <Clock className="h-4 w-4" /> Jornada
            </Link>
            <Link
              to="/wms"
              className="flex items-center gap-2 text-sm text-slate-300 hover:text-white"
            >
              <Warehouse className="h-4 w-4" /> WMS
            </Link>
            <Link
              to="/exportacoes"
              className="flex items-center gap-2 text-sm text-slate-300 hover:text-white"
            >
              <UploadCloud className="h-4 w-4" /> Exportações
            </Link>
            <Link
              to="/importar-dados"
              className="flex items-center gap-2 text-sm text-slate-300 hover:text-white"
            >
              <UploadCloud className="h-4 w-4" /> Importar dados
            </Link>
            {isAdmin && (
              <Link
                to="/auditoria"
                className="flex items-center gap-2 text-sm text-slate-300 hover:text-white"
              >
                <ShieldCheck className="h-4 w-4" /> Auditoria
              </Link>
            )}
            <LogoutButton />
          </div>
        </header>
      )}
      <main>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/registro" element={<RegisterPage />} />
          <Route
            path="/dashboard"
            element={
              <AuthGate>
                <DashboardPage />
              </AuthGate>
            }
          />
          <Route
            path="/"
            element={
              <AuthGate>
                <ViagensListPage />
              </AuthGate>
            }
          />
          <Route
            path="/viagens"
            element={
              <AuthGate>
                <ViagensListPage />
              </AuthGate>
            }
          />
          <Route
            path="/viagens/nova"
            element={
              <AuthGate>
                <ViagemFormPage />
              </AuthGate>
            }
          />
          <Route
            path="/viagens/:id"
            element={
              <AuthGate>
                <ViagemDetailPage />
              </AuthGate>
            }
          />
          <Route
            path="/viagens/:id/fronteira"
            element={
              <AuthGate>
                <FronteiraTravessiaPage />
              </AuthGate>
            }
          />
          <Route
            path="/viagens/:id/validacao-pre-embarque"
            element={
              <AuthGate>
                <ValidacaoPage />
              </AuthGate>
            }
          />
          <Route
            path="/viagens/:id/frete"
            element={
              <AuthGate>
                <ViagemFechamentoPage />
              </AuthGate>
            }
          />
          <Route
            path="/fronteira/kpis"
            element={
              <AuthGate>
                <FronteiraKpiPage />
              </AuthGate>
            }
          />
          <Route
            path="/fretes"
            element={
              <AuthGate>
                <FretesListPage />
              </AuthGate>
            }
          />
          <Route
            path="/fretes/:id"
            element={
              <AuthGate>
                <FreteDetailPage />
              </AuthGate>
            }
          />
          <Route
            path="/frota/kpis"
            element={
              <AuthGate>
                <FrotaKpiPage />
              </AuthGate>
            }
          />
          <Route
            path="/frota/manutencoes"
            element={
              <AuthGate>
                <ManutencoesListPage />
              </AuthGate>
            }
          />
          <Route
            path="/frota/manutencoes/nova"
            element={
              <AuthGate>
                <ManutencaoFormPage />
              </AuthGate>
            }
          />
          <Route
            path="/frota/manutencoes/:id"
            element={
              <AuthGate>
                <ManutencaoDetailPage />
              </AuthGate>
            }
          />
          <Route
            path="/jornada"
            element={
              <AuthGate>
                <JornadaRegistroPage />
              </AuthGate>
            }
          />
          <Route
            path="/jornada/alertas"
            element={
              <AuthGate>
                <JornadaAlertasPage />
              </AuthGate>
            }
          />
          <Route
            path="/jornada/motoristas/:motoristaId/historico"
            element={
              <AuthGate>
                <JornadaHistoricoPage />
              </AuthGate>
            }
          />
          <Route
            path="/wms"
            element={
              <AuthGate>
                <WmsKpiPage />
              </AuthGate>
            }
          />
          <Route
            path="/wms/depositantes"
            element={
              <AuthGate>
                <DepositantesListPage />
              </AuthGate>
            }
          />
          <Route
            path="/wms/depositantes/novo"
            element={
              <AuthGate>
                <DepositanteFormPage />
              </AuthGate>
            }
          />
          <Route
            path="/wms/produtos"
            element={
              <AuthGate>
                <ProdutosListPage />
              </AuthGate>
            }
          />
          <Route
            path="/wms/produtos/:produtoId/rastreio"
            element={
              <AuthGate>
                <RastreioProdutoPage />
              </AuthGate>
            }
          />
          <Route
            path="/wms/armazem/mapa"
            element={
              <AuthGate>
                <ArmazemMapaPage />
              </AuthGate>
            }
          />
          <Route
            path="/wms/recebimentos"
            element={
              <AuthGate>
                <RecebimentosListPage />
              </AuthGate>
            }
          />
          <Route
            path="/wms/recebimentos/novo"
            element={
              <AuthGate>
                <RecebimentoFormPage />
              </AuthGate>
            }
          />
          <Route
            path="/wms/recebimentos/:id"
            element={
              <AuthGate>
                <RecebimentoDetailPage />
              </AuthGate>
            }
          />
          <Route
            path="/wms/expedicoes"
            element={
              <AuthGate>
                <ExpedicoesListPage />
              </AuthGate>
            }
          />
          <Route
            path="/wms/expedicoes/nova"
            element={
              <AuthGate>
                <ExpedicaoFormPage />
              </AuthGate>
            }
          />
          <Route
            path="/wms/expedicoes/:id"
            element={
              <AuthGate>
                <ExpedicaoDetailPage />
              </AuthGate>
            }
          />
          <Route
            path="/wms/avarias"
            element={
              <AuthGate>
                <AvariasListPage />
              </AuthGate>
            }
          />
          <Route
            path="/exportacoes"
            element={
              <AuthGate>
                <ExportacoesPage />
              </AuthGate>
            }
          />
          <Route
            path="/portaria"
            element={
              <AuthGate>
                <PortariaEntradasListPage />
              </AuthGate>
            }
          />
          <Route
            path="/portaria/nova"
            element={
              <AuthGate>
                <PortariaEntradaFormPage />
              </AuthGate>
            }
          />
          <Route
            path="/portaria/:id"
            element={
              <AuthGate>
                <PortariaEntradaDetailPage />
              </AuthGate>
            }
          />
          <Route
            path="/importar-dados"
            element={
              <AuthGate>
                <ImportarDadosPage />
              </AuthGate>
            }
          />
          <Route
            path="/rigabras-ai"
            element={
              <AuthGate>
                <RigabrasAiPage />
              </AuthGate>
            }
          />
          <Route
            path="/auditoria"
            element={
              <AuthGate>
                <AuditoriaListPage />
              </AuthGate>
            }
          />
        </Routes>
      </main>
    </div>
  );
}
