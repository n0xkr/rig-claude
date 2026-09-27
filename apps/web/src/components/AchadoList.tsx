import type { ReactElement } from 'react';
import { AlertTriangle, ClipboardCheck, ShieldAlert } from 'lucide-react';
import type { SeveridadeAchadoValidacao } from '@rigabras/shared';

const SEVERIDADE_ICON: Record<SeveridadeAchadoValidacao, ReactElement> = {
  INFO: <ClipboardCheck className="h-4 w-4 text-slate-400" />,
  AVISO: <AlertTriangle className="h-4 w-4 text-amber-400" />,
  BLOQUEANTE: <ShieldAlert className="h-4 w-4 text-red-400" />,
};

export interface Achado {
  campo: string;
  severidade: SeveridadeAchadoValidacao;
  mensagem: string;
  valorEsperado?: string | null;
  valorEncontrado?: string | null;
}

/**
 * Lista de achados estruturados (campo/severidade/mensagem) — componente
 * compartilhado entre a validação pré-embarque (Módulo 2) e a conformidade
 * de jornada ADI 5322 (Módulo 4), que usam exatamente o mesmo formato de
 * achado em vez de um booleano aprovado/reprovado.
 */
export function AchadoList({ achados }: { achados: Achado[] }) {
  if (achados.length === 0) {
    return <p className="text-sm text-emerald-400">Nenhum achado — conforme.</p>;
  }
  return (
    <ul className="space-y-2">
      {achados.map((achado, idx) => (
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
  );
}
