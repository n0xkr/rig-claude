import { AlertOctagon, AlertTriangle, Info, Loader2, Sparkles } from 'lucide-react';
import type { EscopoInsight } from '@rigabras/shared';
import { useInsights } from '../hooks/useAcompanhamento.js';
import { haptic } from '../lib/haptics.js';

const SEV = {
  critico: {
    icon: AlertOctagon,
    cls: 'border-red-200 bg-red-500/10 text-red-700',
    label: 'Crítico',
  },
  atencao: {
    icon: AlertTriangle,
    cls: 'border-amber-200 bg-amber-500/10 text-amber-700',
    label: 'Atenção',
  },
  info: { icon: Info, cls: 'border-cyan-200 bg-cyan-500/10 text-cyan-700', label: 'Info' },
} as const;

/** Botão + lista de insights gerados por IA para um gráfico (escopo). */
export function InsightsPanel({
  escopo,
  titulo = 'Insights da IA',
}: {
  escopo: EscopoInsight;
  titulo?: string;
}) {
  const { loading, result, error, gerar } = useInsights(escopo);
  return (
    <div className="mt-4 border-t border-slate-200 pt-3" data-testid={`insights-${escopo}`}>
      <button
        type="button"
        disabled={loading}
        onClick={() => {
          haptic('tap');
          void gerar();
        }}
        className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-600 transition hover:bg-blue-100 disabled:opacity-60 duration-200"
        data-testid={`insights-btn-${escopo}`}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Sparkles className="h-3.5 w-3.5" />
        )}
        {result ? 'Atualizar insights' : titulo}
      </button>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {result && (
        <div className="mt-3 space-y-2">
          <p className="text-[11px] text-slate-500">
            {result.origem === 'IA'
              ? 'Gerado por IA (Groq)'
              : 'Gerado por regras (IA indisponível)'}{' '}
            · {new Date(result.geradoEm).toLocaleTimeString('pt-BR')}
          </p>
          {result.insights.map((i, idx) => {
            const s = SEV[i.severidade] ?? SEV.info;
            const Icon = s.icon;
            return (
              <div key={idx} className={`rounded-xl border p-3 text-xs ${s.cls}`}>
                <div className="flex items-center gap-2 font-semibold">
                  <Icon className="h-3.5 w-3.5 shrink-0" /> {i.titulo}
                </div>
                <p className="mt-1 text-slate-600">{i.detalhe}</p>
                {i.acao && <p className="mt-1 text-slate-500">→ {i.acao}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
