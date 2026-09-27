import { Route, Routes, Link } from 'react-router-dom';
import { Truck } from 'lucide-react';
import ViagensListPage from './pages/ViagensListPage.js';
import ViagemFormPage from './pages/ViagemFormPage.js';
import ViagemDetailPage from './pages/ViagemDetailPage.js';

export default function App() {
  return (
    <div className="min-h-screen bg-slate-950">
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-3">
          <Truck className="h-6 w-6 text-rigabras-500" />
          <Link to="/viagens" className="font-semibold text-white">
            Rigabras — Gerenciamento de Risco
          </Link>
        </div>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<ViagensListPage />} />
          <Route path="/viagens" element={<ViagensListPage />} />
          <Route path="/viagens/nova" element={<ViagemFormPage />} />
          <Route path="/viagens/:id" element={<ViagemDetailPage />} />
        </Routes>
      </main>
    </div>
  );
}
