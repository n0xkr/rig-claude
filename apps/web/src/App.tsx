import { lazy, Suspense } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { AuthGate, RotaInicial } from './components/AuthGate.js';
import { DashboardLayout } from './components/layout/DashboardLayout.js';
import { LoadingSkeleton } from './components/StateViews.js';

const LoginPage = lazy(() => import('./pages/LoginPage.js'));
const RegisterPage = lazy(() => import('./pages/RegisterPage.js'));
const DashboardPage = lazy(() => import('./pages/DashboardPage.js'));
const ViagensListPage = lazy(() => import('./pages/ViagensListPage.js'));
const ViagemFormPage = lazy(() => import('./pages/ViagemFormPage.js'));
const ViagemDetailPage = lazy(() => import('./pages/ViagemDetailPage.js'));
const FronteiraTravessiaPage = lazy(() => import('./pages/FronteiraTravessiaPage.js'));
const FronteiraKpiPage = lazy(() => import('./pages/FronteiraKpiPage.js'));
const ValidacaoPage = lazy(() => import('./pages/ValidacaoPage.js'));
const ViagemFechamentoPage = lazy(() => import('./pages/ViagemFechamentoPage.js'));
const FreteDetailPage = lazy(() => import('./pages/FreteDetailPage.js'));
const FretesListPage = lazy(() => import('./pages/FretesListPage.js'));
const FrotaKpiPage = lazy(() => import('./pages/FrotaKpiPage.js'));
const ManutencoesListPage = lazy(() => import('./pages/ManutencoesListPage.js'));
const ManutencaoFormPage = lazy(() => import('./pages/ManutencaoFormPage.js'));
const ManutencaoDetailPage = lazy(() => import('./pages/ManutencaoDetailPage.js'));
const JornadaRegistroPage = lazy(() => import('./pages/JornadaRegistroPage.js'));
const JornadaAlertasPage = lazy(() => import('./pages/JornadaAlertasPage.js'));
const JornadaHistoricoPage = lazy(() => import('./pages/JornadaHistoricoPage.js'));
const WmsKpiPage = lazy(() => import('./pages/WmsKpiPage.js'));
const DepositantesListPage = lazy(() => import('./pages/DepositantesListPage.js'));
const DepositanteFormPage = lazy(() => import('./pages/DepositanteFormPage.js'));
const ProdutosListPage = lazy(() => import('./pages/ProdutosListPage.js'));
const RastreioProdutoPage = lazy(() => import('./pages/RastreioProdutoPage.js'));
const ArmazemMapaPage = lazy(() => import('./pages/ArmazemMapaPage.js'));
const EstoqueListPage = lazy(() => import('./pages/EstoqueListPage.js'));
const RecebimentosListPage = lazy(() => import('./pages/RecebimentosListPage.js'));
const RecebimentoFormPage = lazy(() => import('./pages/RecebimentoFormPage.js'));
const RecebimentoDetailPage = lazy(() => import('./pages/RecebimentoDetailPage.js'));
const ExpedicoesListPage = lazy(() => import('./pages/ExpedicoesListPage.js'));
const ExpedicaoFormPage = lazy(() => import('./pages/ExpedicaoFormPage.js'));
const ExpedicaoDetailPage = lazy(() => import('./pages/ExpedicaoDetailPage.js'));
const AvariasListPage = lazy(() => import('./pages/AvariasListPage.js'));
const ExportacoesPage = lazy(() => import('./pages/ExportacoesPage.js'));
const PortariaEntradasListPage = lazy(() => import('./pages/PortariaEntradasListPage.js'));
const PortariaEntradaFormPage = lazy(() => import('./pages/PortariaEntradaFormPage.js'));
const PortariaEntradaDetailPage = lazy(() => import('./pages/PortariaEntradaDetailPage.js'));
const ImportarDadosPage = lazy(() => import('./pages/ImportarDadosPage.js'));
const RigabrasAiPage = lazy(() => import('./pages/RigabrasAiPage.js'));
const AuditoriaListPage = lazy(() => import('./pages/AuditoriaListPage.js'));
const UsuariosPage = lazy(() => import('./pages/UsuariosPage.js'));
const GerenciarDadosPage = lazy(() => import('./pages/GerenciarDadosPage.js'));
const PerfilPage = lazy(() => import('./pages/PerfilPage.js'));
const SolicitacoesIaPage = lazy(() => import('./pages/SolicitacoesIaPage.js'));
const AcompanhamentoPage = lazy(() => import('./pages/AcompanhamentoPage.js'));
const MotoristasListPage = lazy(() => import('./pages/MotoristasListPage.js'));
const MotoristaFormPage = lazy(() => import('./pages/MotoristaFormPage.js'));

export default function App() {
  const location = useLocation();
  const isPublicRoute = location.pathname === '/login' || location.pathname === '/registro';

  const routes = (
    <Suspense
      fallback={
        <div className="p-6">
          <LoadingSkeleton rows={4} />
        </div>
      }
    >
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
          path="/wms/estoque"
          element={
            <AuthGate modulo="wms">
              <EstoqueListPage />
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
    </Suspense>
  );

  if (isPublicRoute) return <div className="min-h-screen">{routes}</div>;
  return <DashboardLayout>{routes}</DashboardLayout>;
}
