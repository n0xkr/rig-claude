import { Route, Routes, Link } from 'react-router-dom';
import { Truck, Gauge, Wallet, Wrench, Clock } from 'lucide-react';
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

export default function App() {
  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-3">
          <Link to="/viagens" className="flex items-center gap-2 font-semibold text-white">
            <Truck className="h-6 w-6 text-rigabras-500" />
            Rigabras — TMS Operacional
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
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<ViagensListPage />} />
          <Route path="/viagens" element={<ViagensListPage />} />
          <Route path="/viagens/nova" element={<ViagemFormPage />} />
          <Route path="/viagens/:id" element={<ViagemDetailPage />} />
          <Route path="/viagens/:id/fronteira" element={<FronteiraTravessiaPage />} />
          <Route path="/viagens/:id/validacao-pre-embarque" element={<ValidacaoPage />} />
          <Route path="/viagens/:id/frete" element={<ViagemFechamentoPage />} />
          <Route path="/fronteira/kpis" element={<FronteiraKpiPage />} />
          <Route path="/fretes" element={<FretesListPage />} />
          <Route path="/fretes/:id" element={<FreteDetailPage />} />
          <Route path="/frota/kpis" element={<FrotaKpiPage />} />
          <Route path="/frota/manutencoes" element={<ManutencoesListPage />} />
          <Route path="/frota/manutencoes/nova" element={<ManutencaoFormPage />} />
          <Route path="/frota/manutencoes/:id" element={<ManutencaoDetailPage />} />
          <Route path="/jornada" element={<JornadaRegistroPage />} />
          <Route path="/jornada/alertas" element={<JornadaAlertasPage />} />
          <Route
            path="/jornada/motoristas/:motoristaId/historico"
            element={<JornadaHistoricoPage />}
          />
        </Routes>
      </main>
    </div>
  );
}
