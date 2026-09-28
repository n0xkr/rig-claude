import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { usePortariaActions } from '../hooks/usePortaria.js';

/**
 * Formulário de registro de entrada da portaria (Módulo 8) — mobile-first,
 * pensado para o porteiro usar pelo celular (critério #23 do documento de
 * evolução): placa -> motorista -> confirmar. Os demais campos são
 * opcionais para nunca bloquear o registro rápido da chegada.
 */
export default function PortariaEntradaFormPage() {
  const navigate = useNavigate();
  const { registrarEntrada, submitting, error } = usePortariaActions();

  const [placaCavalo, setPlacaCavalo] = useState('');
  const [placaCarreta, setPlacaCarreta] = useState('');
  const [motoristaNome, setMotoristaNome] = useState('');
  const [motoristaDocumento, setMotoristaDocumento] = useState('');
  const [empresaProprietario, setEmpresaProprietario] = useState('');
  const [numeroCrt, setNumeroCrt] = useState('');
  const [cliente, setCliente] = useState('');
  const [tipoOperacao, setTipoOperacao] = useState<'DESCARGA' | 'CARGA' | 'TRANSITO'>('DESCARGA');
  const [observacoes, setObservacoes] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = await registrarEntrada({
      placa_cavalo: placaCavalo.toUpperCase(),
      placa_carreta: placaCarreta.toUpperCase() || undefined,
      motorista_nome: motoristaNome,
      motorista_documento: motoristaDocumento || undefined,
      empresa_proprietario: empresaProprietario || undefined,
      numero_crt: numeroCrt || undefined,
      cliente: cliente || undefined,
      tipo_operacao: tipoOperacao,
      observacoes: observacoes || undefined,
    });
    if (result) navigate(`/portaria/${result.entrada.id}`);
  }

  return (
    <div className="mx-auto max-w-md px-4 py-6">
      <Link
        to="/portaria"
        className="mb-4 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>
      <h1 className="mb-6 text-2xl font-bold text-white">Nova entrada</h1>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-slate-800 p-5">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-300">Placa do cavalo *</span>
          <input
            required
            autoFocus
            className="input text-lg uppercase"
            placeholder="AAA0A00"
            value={placaCavalo}
            onChange={(e) => setPlacaCavalo(e.target.value)}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-300">Placa da carreta</span>
          <input
            className="input uppercase"
            value={placaCarreta}
            onChange={(e) => setPlacaCarreta(e.target.value)}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-300">Motorista *</span>
          <input
            required
            className="input"
            value={motoristaNome}
            onChange={(e) => setMotoristaNome(e.target.value)}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-300">
            CPF/documento do motorista
          </span>
          <input
            className="input"
            value={motoristaDocumento}
            onChange={(e) => setMotoristaDocumento(e.target.value)}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-300">
            Empresa/proprietário
          </span>
          <input
            className="input"
            value={empresaProprietario}
            onChange={(e) => setEmpresaProprietario(e.target.value)}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-300">Número do CRT</span>
            <input
              className="input"
              value={numeroCrt}
              onChange={(e) => setNumeroCrt(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-300">Cliente</span>
            <input className="input" value={cliente} onChange={(e) => setCliente(e.target.value)} />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-300">
            Tipo de operação *
          </span>
          <select
            className="input"
            value={tipoOperacao}
            onChange={(e) => setTipoOperacao(e.target.value as typeof tipoOperacao)}
          >
            <option value="DESCARGA">Descarga (abre OS automaticamente)</option>
            <option value="CARGA">Carga</option>
            <option value="TRANSITO">Trânsito</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-300">Observações</span>
          <textarea
            className="input"
            rows={2}
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
          />
        </label>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-rigabras-500 px-4 py-3 text-base font-semibold text-white hover:bg-blue-600 disabled:opacity-50"
        >
          {submitting ? 'Registrando...' : 'Registrar entrada'}
        </button>
        <p className="text-center text-xs text-slate-500">
          Após confirmar, você poderá fotografar os documentos (CRT, ordem de coleta) na tela seguinte.
        </p>
      </form>
    </div>
  );
}
