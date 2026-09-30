import { useEffect, useState } from 'react';
import {
  formatarValorCampoPersonalizado,
  type CampoPersonalizado,
  type EntidadeCampoPersonalizado,
} from '@rigabras/shared';
import { api } from '../lib/apiClient.js';

/** Catálogo por entidade, buscado uma vez por sessão de página (as telas reabrem o mesmo registro muitas vezes). */
const cache = new Map<EntidadeCampoPersonalizado, Promise<CampoPersonalizado[]>>();

function catalogo(entidade: EntidadeCampoPersonalizado): Promise<CampoPersonalizado[]> {
  let p = cache.get(entidade);
  if (!p) {
    p = api
      .get<{ data: CampoPersonalizado[] }>(`/campos-personalizados?entidade=${entidade}`)
      .then((r) => r.data)
      .catch(() => {
        cache.delete(entidade);
        return [] as CampoPersonalizado[];
      });
    cache.set(entidade, p);
  }
  return p;
}

/**
 * Campos adicionais do registro: colunas novas das planilhas que o sistema ainda não tinha (valores em
 * `dados_extras`). O catálogo dá o tipo de cada uma — horas aparecem como 14:30, datas como dd/mm/aaaa.
 */
export function CamposAdicionais({
  entidade,
  extras,
  titulo = 'Campos adicionais',
}: {
  entidade: EntidadeCampoPersonalizado;
  extras: Record<string, unknown> | null | undefined;
  titulo?: string;
}) {
  const [campos, setCampos] = useState<CampoPersonalizado[]>([]);
  useEffect(() => {
    let ativo = true;
    void catalogo(entidade).then((c) => ativo && setCampos(c));
    return () => {
      ativo = false;
    };
  }, [entidade]);

  const entradas = Object.entries(extras ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== '');
  if (entradas.length === 0) return null;
  const porChave = new Map(campos.map((c) => [c.chave, c]));

  return (
    <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="campos-adicionais">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">{titulo}</h2>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {entradas.map(([chave, valor]) => {
          const def = porChave.get(chave);
          return (
            <div key={chave} className="min-w-0">
              <dt className="truncate text-xs font-medium text-slate-500" title={chave}>
                {def?.rotulo ?? chave}
              </dt>
              <dd className="break-words text-slate-900">{formatarValorCampoPersonalizado(valor, def?.tipo)}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
