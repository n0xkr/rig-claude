import { Route, Routes, useLocation } from 'react-router-dom';
import { AuthGate, RotaInicial } from './components/AuthGate.js';
import { DashboardLayout } from './components/layout/DashboardLayout.js';
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
import UsuariosPage from './pages/UsuariosPage.js';
import GerenciarDadosPage from './pages/GerenciarDadosPage.js';
import PerfilPage from './pages/PerfilPage.js';
import SolicitacoesIaPage from './pages/SolicitacoesIaPage.js';
import AcompanhamentoPage from './pages/AcompanhamentoPage.js';
import MotoristasListPage from './pages/MotoristasListPage.js';
import MotoristaFormPage from './pages/MotoristaFormPage.js';

export default function App() {
  const location = useLocation();
  const isPublicRoute = location.pathname === '/login' || location.pathname === '/registro';

  const routes = (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/registro" element={<RegisterPage />} />
      <Route
        path="/dashboard"
        element={
          <AuthGate modulo="painel">
            <DashboardPage />
          </AuthGate>
        }
      />
      <Route path="/" element={<RotaInicial />} />
      <Route
        path="/viagens"
        element={
          <AuthGate modulo="viagens">
            <ViagensListPage />
          </AuthGate>
        }
      />
      <Route
        path="/viagens/nova"
        element={
          <AuthGate modulo="viagens">
            <ViagemFormPage />
          </AuthGate>
        }
      />
      <Route
        path="/viagens/:id"
        element={
          <AuthGate modulo="viagens">
            <ViagemDetailPage />
          </AuthGate>
        }
      />
      <Route
        path="/viagens/:id/editar"
        element={
          <AuthGate modulo="viagens">
            <ViagemFormPage />
          </AuthGate>
        }
      />
      <Route
        path="/motoristas"
        element={
          <AuthGate modulo="motoristas">
            <MotoristasListPage />
          </AuthGate>
        }
      />
      <Route
        path="/motoristas/novo"
        element={
          <AuthGate modulo="motoristas">
            <MotoristaFormPage />
          </AuthGate>
        }
      />
      <Route
        path="/motoristas/:id"
        element={
          <AuthGate modulo="motoristas">
            <MotoristaFormPage />
          </AuthGate>
        }
      />
      <Route
        path="/viagens/:id/fronteira"
        element={
          <AuthGate modulo="viagens">
            <FronteiraTravessiaPage />
          </AuthGate>
        }
      />
      <Route
        path="/viagens/:id/validacao-pre-embarque"
        element={
          <AuthGate modulo="viagens">
            <ValidacaoPage />
          </AuthGate>
        }
      />
      <Route
        path="/viagens/:id/frete"
        element={
          <AuthGate modulo="viagens">
            <ViagemFechamentoPage />
          </AuthGate>
        }
      />
      <Route
        path="/fronteira/kpis"
        element={
          <AuthGate modulo="fronteira">
            <FronteiraKpiPage />
          </AuthGate>
        }
      />
      <Route
        path="/fretes"
        element={
          <AuthGate modulo="fretes">
            <FretesListPage />
          </AuthGate>
        }
      />
      <Route
        path="/fretes/:id"
        element={
          <AuthGate modulo="fretes">
            <FreteDetailPage />
          </AuthGate>
        }
      />
      <Route
        path="/frota/kpis"
        element={
          <AuthGate modulo="frota">
            <FrotaKpiPage />
          </AuthGate>
        }
      />
      <Route
        path="/frota/manutencoes"
        element={
          <AuthGate modulo="frota">
            <ManutencoesListPage />
          </AuthGate>
        }
      />
      <Route
        path="/frota/manutencoes/nova"
        element={
          <AuthGate modulo="frota">
            <ManutencaoFormPage />
          </AuthGate>
        }
      />
      <Route
        path="/frota/manutencoes/:id"
        element={
          <AuthGate modulo="frota">
            <ManutencaoDetailPage />
          </AuthGate>
        }
      />
      <Route
        path="/jornada"
        element={
          <AuthGate modulo="jornada">
            <JornadaRegistroPage />
          </AuthGate>
        }
      />
      <Route
        path="/jornada/alertas"
        element={
          <AuthGate modulo="jornada">
            <JornadaAlertasPage />
          </AuthGate>
        }
      />
      <Route
        path="/jornada/motoristas/:motoristaId/historico"
        element={
          <AuthGate modulo="jornada">
            <JornadaHistoricoPage />
          </AuthGate>
        }
      />
      <Route
        path="/wms"
        element={
          <AuthGate modulo="wms">
            <WmsKpiPage />
          </AuthGate>
        }
      />
      <Route
        path="/wms/depositantes"
        element={
          <AuthGate modulo="wms">
            <DepositantesListPage />
          </AuthGate>
        }
      />
      <Route
        path="/wms/depositantes/novo"
        element={
          <AuthGate modulo="wms">
            <DepositanteFormPage />
          </AuthGate>
        }
      />
      <Route
        path="/wms/produtos"
        element={
          <AuthGate modulo="wms">
            <ProdutosListPage />
          </AuthGate>
        }
      />
      <Route
        path="/wms/produtos/:produtoId/rastreio"
        element={
          <AuthGate modulo="wms">
            <RastreioProdutoPage />
          </AuthGate>
        }
      />
      <Route
        path="/wms/armazem/mapa"
        element={
          <AuthGate modulo="wms">
            <ArmazemMapaPage />
          </AuthGate>
        }
      />
      <Route
        path="/wms/recebimentos"
        element={
          <AuthGate modulo="wms">
            <RecebimentosListPage />
          </AuthGate>
        }
      />
      <Route
        path="/wms/recebimentos/novo"
        element={
          <AuthGate modulo="wms">
            <RecebimentoFormPage />
          </AuthGate>
        }
      />
      <Route
        path="/wms/recebimentos/:id"
        element={
          <AuthGate modulo="wms">
            <RecebimentoDetailPage />
          </AuthGate>
        }
      />
      <Route
        path="/wms/expedicoes"
        element={
          <AuthGate modulo="wms">
            <ExpedicoesListPage />
          </AuthGate>
        }
      />
      <Route
        path="/wms/expedicoes/nova"
        element={
          <AuthGate modulo="wms">
            <ExpedicaoFormPage />
          </AuthGate>
        }
      />
      <Route
        path="/wms/expedicoes/:id"
        element={
          <AuthGate modulo="wms">
            <ExpedicaoDetailPage />
          </AuthGate>
        }
      />
      <Route
        path="/wms/avarias"
        element={
          <AuthGate modulo="wms">
            <AvariasListPage />
          </AuthGate>
        }
      />
      <Route
        path="/exportacoes"
        element={
          <AuthGate modulo="exportacoes">
            <ExportacoesPage />
          </AuthGate>
        }
      />
      <Route
        path="/portaria"
        element={
          <AuthGate modulo="portaria">
            <PortariaEntradasListPage />
          </AuthGate>
        }
      />
      <Route
        path="/portaria/nova"
        element={
          <AuthGate modulo="portaria">
            <PortariaEntradaFormPage />
          </AuthGate>
        }
      />
      <Route
        path="/portaria/:id"
        element={
          <AuthGate modulo="portaria">
            <PortariaEntradaDetailPage />
          </AuthGate>
        }
      />
      <Route
        path="/importar-dados"
        element={
          <AuthGate modulo="importacao">
            <ImportarDadosPage />
          </AuthGate>
        }
      />
      <Route
        path="/importar-ia"
        element={
          <AuthGate modulo="importacao">
            <ImportarDadosPage />
          </AuthGate>
        }
      />
      <Route
        path="/solicitacoes-ia"
        element={
          <AuthGate modulo="solicitacoes_ia">
            <SolicitacoesIaPage />
          </AuthGate>
        }
      />
      <Route
        path="/perfil"
        element={
          <AuthGate>
            <PerfilPage />
          </AuthGate>
        }
      />
      <Route
        path="/rigabras-ai"
        element={
          <AuthGate modulo="rigabras_ai">
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
      <Route
        path="/acompanhamento"
        element={
          <AuthGate modulo="acompanhamento">
            <AcompanhamentoPage />
          </AuthGate>
        }
      />
      <Route
        path="/usuarios"
        element={
          <AuthGate>
            <UsuariosPage />
          </AuthGate>
        }
      />
      <Route
        path="/gerenciar-dados"
        element={
          <AuthGate>
            <GerenciarDadosPage />
          </AuthGate>
        }
      />
    </Routes>
  );

  if (isPublicRoute) return <div className="min-h-screen">{routes}</div>;
  return <DashboardLayout>{routes}</DashboardLayout>;
}
