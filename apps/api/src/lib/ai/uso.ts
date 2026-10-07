import type { AcumuladorUsoLike, EstadoCache, MotivoFalhaIa, ResultadoIa } from './tipos.js';

/**
 * Contabilidade de uso da IA: tokens (de `completion.usage`), latência,
 * custo estimado e falhas por motivo — por tarefa e por modelo. Nada aqui
 * guarda conteúdo de prompt ou resposta.
 */

export interface RegistroUsoIa {
  tarefa: string;
  familia: string;
  modelo: string | null;
  usuarioId: string | null;
  latenciaMs: number;
  tokensEntrada: number;
  tokensSaida: number;
  custoEstimadoUsd: number;
  cache: EstadoCache;
  resultado: 'OK' | MotivoFalhaIa;
  chamadas: number;
  reparado: boolean;
}

export interface EstatisticaUsoIa {
  chamadas: number;
  sucessos: number;
  falhas: number;
  falhasPorMotivo: Partial<Record<MotivoFalhaIa, number>>;
  cacheHits: number;
  reparadas: number;
  tokensEntrada: number;
  tokensSaida: number;
  custoEstimadoUsd: number;
  latenciaMediaMs: number;
  latenciaMaxMs: number;
}

export interface EstatisticaModeloIa {
  requisicoes: number;
  falhas: number;
  taxaFalha: number;
  falhasPorCodigo: Record<string, number>;
  latenciaMediaMs: number;
  tokensEntrada: number;
  tokensSaida: number;
  custoEstimadoUsd: number;
}

export interface SnapshotUsoIa {
  desde: string;
  total: EstatisticaUsoIa;
  porTarefa: Record<string, EstatisticaUsoIa>;
  porModelo: Record<string, EstatisticaModeloIa>;
}

const novaEstatistica = (): EstatisticaUsoIa & { somaLatencia: number } => ({
  chamadas: 0,
  sucessos: 0,
  falhas: 0,
  falhasPorMotivo: {},
  cacheHits: 0,
  reparadas: 0,
  tokensEntrada: 0,
  tokensSaida: 0,
  custoEstimadoUsd: 0,
  latenciaMediaMs: 0,
  latenciaMaxMs: 0,
  somaLatencia: 0,
});

type EstatInterna = ReturnType<typeof novaEstatistica>;
type ModeloInterno = Omit<EstatisticaModeloIa, 'taxaFalha' | 'latenciaMediaMs'> & { somaLatencia: number };

const arred = (n: number, casas = 6) => Math.round(n * 10 ** casas) / 10 ** casas;

function publicar(e: EstatInterna): EstatisticaUsoIa {
  const { somaLatencia, ...resto } = e;
  return {
    ...resto,
    falhasPorMotivo: { ...resto.falhasPorMotivo },
    custoEstimadoUsd: arred(resto.custoEstimadoUsd),
    latenciaMediaMs: e.chamadas > 0 ? Math.round(somaLatencia / e.chamadas) : 0,
  };
}

/** Agregador global (por processo) — base de `getAiUsageSnapshot()`. */
export class RegistroUso {
  private desde = new Date().toISOString();
  private readonly total = novaEstatistica();
  private readonly porTarefa = new Map<string, EstatInterna>();
  private readonly porModelo = new Map<string, ModeloInterno>();

  registrarTarefa(r: RegistroUsoIa): void {
    let t = this.porTarefa.get(r.tarefa);
    if (!t) {
      // Limite de tarefas distintas: nomes de tarefa vêm do código, mas por garantia.
      if (this.porTarefa.size >= 200) return this.acumular(this.total, r);
      t = novaEstatistica();
      this.porTarefa.set(r.tarefa, t);
    }
    this.acumular(t, r);
    this.acumular(this.total, r);
  }

  private acumular(e: EstatInterna, r: RegistroUsoIa) {
    e.chamadas++;
    if (r.resultado === 'OK') e.sucessos++;
    else {
      e.falhas++;
      e.falhasPorMotivo[r.resultado] = (e.falhasPorMotivo[r.resultado] ?? 0) + 1;
    }
    if (r.cache === 'hit') e.cacheHits++;
    if (r.reparado) e.reparadas++;
    e.tokensEntrada += r.tokensEntrada;
    e.tokensSaida += r.tokensSaida;
    e.custoEstimadoUsd += r.custoEstimadoUsd;
    e.somaLatencia += r.latenciaMs;
    e.latenciaMaxMs = Math.max(e.latenciaMaxMs, r.latenciaMs);
  }

  /** Uma requisição HTTP ao provedor (inclui retentativas), para taxa de falha/latência por modelo. */
  registrarRequisicaoModelo(
    modelo: string,
    r: { ok: boolean; latenciaMs: number; tokensEntrada?: number; tokensSaida?: number; custoUsd?: number; codigo?: string },
  ): void {
    let m = this.porModelo.get(modelo);
    if (!m) {
      if (this.porModelo.size >= 50) return;
      m = { requisicoes: 0, falhas: 0, falhasPorCodigo: {}, tokensEntrada: 0, tokensSaida: 0, custoEstimadoUsd: 0, somaLatencia: 0 };
      this.porModelo.set(modelo, m);
    }
    m.requisicoes++;
    m.somaLatencia += r.latenciaMs;
    m.tokensEntrada += r.tokensEntrada ?? 0;
    m.tokensSaida += r.tokensSaida ?? 0;
    m.custoEstimadoUsd += r.custoUsd ?? 0;
    if (!r.ok) {
      m.falhas++;
      const c = (r.codigo ?? 'erro').slice(0, 40);
      m.falhasPorCodigo[c] = (m.falhasPorCodigo[c] ?? 0) + 1;
    }
  }

  snapshot(): SnapshotUsoIa {
    const porModelo: Record<string, EstatisticaModeloIa> = {};
    for (const [k, m] of this.porModelo) {
      const { somaLatencia, ...resto } = m;
      porModelo[k] = {
        ...resto,
        falhasPorCodigo: { ...resto.falhasPorCodigo },
        custoEstimadoUsd: arred(resto.custoEstimadoUsd),
        taxaFalha: m.requisicoes > 0 ? arred(m.falhas / m.requisicoes, 4) : 0,
        latenciaMediaMs: m.requisicoes > 0 ? Math.round(somaLatencia / m.requisicoes) : 0,
      };
    }
    const porTarefa: Record<string, EstatisticaUsoIa> = {};
    for (const [k, e] of this.porTarefa) porTarefa[k] = publicar(e);
    return { desde: this.desde, total: publicar(this.total), porTarefa, porModelo };
  }

  resetar(): void {
    this.desde = new Date().toISOString();
    Object.assign(this.total, novaEstatistica());
    this.porTarefa.clear();
    this.porModelo.clear();
  }
}

export interface ResumoUsoIa {
  chamadas: number;
  sucessos: number;
  cacheHits: number;
  falhas: number;
  falhasPorMotivo: Partial<Record<MotivoFalhaIa, number>>;
  tempoMs: number;
  tokensEntrada: number;
  tokensSaida: number;
  custoEstimadoUsd: number;
  /** Itens que não foram à IA (truncados, suspeitos de injection ou fora do orçamento). */
  itensNaoEnviados: number;
  modelos: string[];
}

/**
 * Acumulador por requisição (ex.: uma importação inteira): passe-o em
 * `contexto.uso` e use `resumo()` para preencher `resultado.ia`.
 */
export class AcumuladorUsoIa implements AcumuladorUsoLike {
  private r: ResumoUsoIa = {
    chamadas: 0,
    sucessos: 0,
    cacheHits: 0,
    falhas: 0,
    falhasPorMotivo: {},
    tempoMs: 0,
    tokensEntrada: 0,
    tokensSaida: 0,
    custoEstimadoUsd: 0,
    itensNaoEnviados: 0,
    modelos: [],
  };

  registrar(resultado: ResultadoIa<unknown>): void {
    const { meta } = resultado;
    this.r.chamadas++;
    if (resultado.ok) this.r.sucessos++;
    else {
      this.r.falhas++;
      this.r.falhasPorMotivo[resultado.motivo] = (this.r.falhasPorMotivo[resultado.motivo] ?? 0) + 1;
    }
    if (meta.cache === 'hit') this.r.cacheHits++;
    this.r.tempoMs += meta.latenciaMs;
    this.r.tokensEntrada += meta.tokensEntrada;
    this.r.tokensSaida += meta.tokensSaida;
    this.r.custoEstimadoUsd += meta.custoEstimadoUsd;
    this.r.itensNaoEnviados += meta.entrada.itensOmitidos + meta.entrada.suspeitosRemovidos;
    if (meta.modelo && !this.r.modelos.includes(meta.modelo)) this.r.modelos.push(meta.modelo);
  }

  /** Itens descartados antes de montar o prompt (ex.: `dividirEmLotes(...).omitidos`). */
  adicionarNaoEnviados(n: number): void {
    if (Number.isFinite(n) && n > 0) this.r.itensNaoEnviados += n;
  }

  resumo(): ResumoUsoIa {
    return {
      ...this.r,
      falhasPorMotivo: { ...this.r.falhasPorMotivo },
      modelos: [...this.r.modelos],
      custoEstimadoUsd: arred(this.r.custoEstimadoUsd),
    };
  }
}
