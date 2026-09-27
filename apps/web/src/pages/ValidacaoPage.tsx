import { useParams } from 'react-router-dom';
import { useState, type ReactElement } from 'react';
import { ClipboardCheck, CheckCircle2, AlertTriangle, ShieldAlert } from 'lucide-react';
import { useValidacaoPreEmbarque } from '../hooks/useValidacaoPreEmbarque.js';
import { EmptyState } from '../components/StateViews.js';
import type { SeveridadeAchadoValidacao } from '@rigabras/shared';

const SEVERIDADE_ICON: Record<SeveridadeAchadoValidacao, ReactElement> = {
  INFO: <ClipboardCheck className="h-4 w-4 text-slate-400" />,
  AVISO: <AlertTriangle className="h-4 w-4 text-amber-400" />,
  BLOQUEANTE: <ShieldAlert className="h-4 w-4 text-red-400" />,
};

/**
 * Tela de resultados da validação cruzada pré-embarque (Módulo 2, critério
 * #3): cruza CRT, Fatura, MIC/DTA, dados do veículo e da viagem, exibindo
 * uma lista estruturada de achados (não apenas aprovado/reprovado).
 */
export default function ValidacaoPage() {
  const { id } = useParams<{ id: string }>();
  const { resultado, submitting, error, validar } = useValidacaoPreEmbarque(id);
  const [faturaNumero, setFaturaNumero] = useState('');
  const [faturaValor, setFaturaValor] = useState('');
  const [micDtaNumero, setMicDtaNumero] = useState('');

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-2 flex items-center gap-2 text-2xl font-bold text-white">
        <ClipboardCheck className="h-6 w-6 text-rigabras-500" />
        Validação pré-embarque
      </h1>
      <p className="mb-6 text-sm text-slate-400">
        Cruza CRT, Fatura, MIC/DTA, dados do veículo e da viagem, retornando uma lista estruturada
        de inconsistências.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void validar({
            fatura_numero: faturaNumero || null,
            fatura_valor: faturaValor ? Number(faturaValor) : null,
            mic_dta_numero: micDtaNumero || null,
          });
        }}
        className="mb-8 grid grid-cols-1 gap-3 rounded-lg border border-slate-800 p-4 sm:grid-cols-3"
      >
        <input
          value={faturaNumero}
          onChange={(e) => setFaturaNumero(e.target.value)}
          placeholder="Nº da fatura (opcional)"
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-rigabras-500 focus:outline-none"
        />
        <input
          value={faturaValor}
          onChange={(e) => setFaturaValor(e.target.value)}
          placeholder="Valor da fatura (opcional)"
          inputMode="decimal"
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-rigabras-500 focus:outline-none"
        />
        <input
          value={micDtaNumero}
          onChange={(e) => setMicDtaNumero(e.target.value)}
          placeholder="Nº do MIC/DTA (opcional)"
          className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-rigabras-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={submitting}
          className="col-span-full rounded-md bg-rigabras-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
        >
          {submitting ? 'Validando…' : 'Executar validação cruzada'}
        </button>
      </form>

      {error && (
        <div className="mb-6 rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      {!resultado ? (
        <EmptyState
          title="Nenhuma validação executada ainda"
          description="Preencha os dados opcionais de fatura/MIC-DTA (se houver) e clique em executar para gerar o resultado do cross-check."
        />
      ) : (
        <div>
          <div
            className={`mb-4 flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
              resultado.aprovado
                ? 'border-emerald-900/50 bg-emerald-950/30 text-emerald-200'
                : 'border-red-900/50 bg-red-950/30 text-red-200'
            }`}
          >
            {resultado.aprovado ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <ShieldAlert className="h-4 w-4" />
            )}
            {resultado.aprovado
              ? 'Nenhum achado bloqueante — viagem apta a seguir para o embarque'
              : 'Existem achados bloqueantes — corrija antes de liberar o embarque'}
          </div>

          {resultado.documentos_faltantes.length > 0 && (
            <p className="mb-4 text-sm text-amber-300">
              Documentos faltantes: {resultado.documentos_faltantes.join(', ')}
            </p>
          )}

          {resultado.achados.length === 0 ? (
            <EmptyState title="Nenhum achado" description="Nenhuma inconsistência encontrada." />
          ) : (
            <ul className="space-y-2">
              {resultado.achados.map((achado, idx) => (
                <li
                  key={`${achado.campo}-${idx}`}
                  className="flex items-start gap-3 rounded-lg border border-slate-800 p-3"
                >
                  {SEVERIDADE_ICON[achado.severidade]}
                  <div>
                    <p className="text-sm font-medium text-slate-100">
                      {achado.campo} — {achado.severidade}
                    </p>
                    <p className="text-sm text-slate-400">{achado.mensagem}</p>
                    {(achado.valorEsperado || achado.valorEncontrado) && (
                      <p className="mt-1 text-xs text-slate-500">
                        Esperado: {achado.valorEsperado ?? '-'} · Encontrado:{' '}
                        {achado.valorEncontrado ?? '-'}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
