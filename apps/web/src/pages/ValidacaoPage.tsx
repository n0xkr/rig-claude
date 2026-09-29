import { useParams } from 'react-router-dom';
import { useState, type ReactElement } from 'react';
import { ClipboardCheck, CheckCircle2, AlertTriangle, ShieldAlert } from 'lucide-react';
import { useValidacaoPreEmbarque } from '../hooks/useValidacaoPreEmbarque.js';
import { EmptyState } from '../components/StateViews.js';
import type { SeveridadeAchadoValidacao } from '@rigabras/shared';

const SEVERIDADE_ICON: Record<SeveridadeAchadoValidacao, ReactElement> = {
  INFO: <ClipboardCheck className="h-4 w-4 text-slate-500" />,
  AVISO: <AlertTriangle className="h-4 w-4 text-amber-600" />,
  BLOQUEANTE: <ShieldAlert className="h-4 w-4 text-red-600" />,
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
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="mb-2 flex items-center gap-2 text-2xl font-bold text-slate-900">
        <ClipboardCheck className="h-6 w-6 text-rigabras-500" />
        Validação pré-embarque
      </h1>
      <p className="mb-6 text-sm text-slate-500">
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
        className="mb-8 grid grid-cols-1 gap-4 rounded-xl border border-slate-200 p-6 sm:grid-cols-3 bg-white shadow-sm"
      >
        <input
          value={faturaNumero}
          onChange={(e) => setFaturaNumero(e.target.value)}
          placeholder="Nº da fatura (opcional)"
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-rigabras-500 focus:outline-none"
        />
        <input
          value={faturaValor}
          onChange={(e) => setFaturaValor(e.target.value)}
          placeholder="Valor da fatura (opcional)"
          inputMode="decimal"
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-rigabras-500 focus:outline-none"
        />
        <input
          value={micDtaNumero}
          onChange={(e) => setMicDtaNumero(e.target.value)}
          placeholder="Nº do MIC/DTA (opcional)"
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-rigabras-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={submitting}
          className="col-span-full rounded-xl bg-rigabras-500 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-all duration-200"
        >
          {submitting ? 'Validando…' : 'Executar validação cruzada'}
        </button>
      </form>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
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
            className={`mb-4 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
              resultado.aprovado
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-red-200 bg-red-50 text-red-700'
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
            <p className="mb-4 text-sm text-amber-700">
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
                  className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 bg-white shadow-sm"
                >
                  {SEVERIDADE_ICON[achado.severidade]}
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {achado.campo} — {achado.severidade}
                    </p>
                    <p className="text-sm text-slate-500">{achado.mensagem}</p>
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
