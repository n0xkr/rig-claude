/**
 * Controles de resiliência e custo da camada de IA, todos em memória do
 * processo: semáforo de concorrência, disjuntor (circuit breaker) e limites
 * por usuário/família por minuto e por dia (o dia vira à meia-noite de
 * Brasília). O rate limit do Fastify é por IP e roda antes da autenticação,
 * então não substitui estes limites.
 */

/** Erro de espera cancelada (prazo/abort) num semáforo. */
export class EsperaCanceladaError extends Error {
  constructor() {
    super('Espera pela IA cancelada');
    this.name = 'EsperaCanceladaError';
  }
}

export class Semaforo {
  private emUso = 0;
  private readonly fila: Array<{ liberar: () => void; cancelar: () => void }> = [];

  constructor(readonly limite: number) {}

  get ocupados(): number {
    return this.emUso;
  }

  get aguardando(): number {
    return this.fila.length;
  }

  /** Aguarda uma vaga; devolve a função de liberação (idempotente). */
  adquirir(signal?: AbortSignal | null): Promise<() => void> {
    if (signal?.aborted) return Promise.reject(new EsperaCanceladaError());
    const liberacao = () => {
      let liberado = false;
      return () => {
        if (liberado) return;
        liberado = true;
        this.emUso--;
        const proximo = this.fila.shift();
        if (proximo) proximo.liberar();
      };
    };
    if (this.emUso < this.limite) {
      this.emUso++;
      return Promise.resolve(liberacao());
    }
    return new Promise((resolve, reject) => {
      const item = {
        liberar: () => {
          signal?.removeEventListener('abort', onAbort);
          this.emUso++;
          resolve(liberacao());
        },
        cancelar: () => reject(new EsperaCanceladaError()),
      };
      const onAbort = () => {
        const i = this.fila.indexOf(item);
        if (i >= 0) this.fila.splice(i, 1);
        item.cancelar();
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.fila.push(item);
    });
  }
}

export type EstadoDisjuntor = 'fechado' | 'aberto' | 'meio-aberto';

/**
 * Disjuntor: após `limiteFalhas` falhas seguidas (timeout/5xx/rede/429 do
 * provedor) fica aberto por `pausaMs` e a IA é pulada na hora (INDISPONIVEL),
 * para uma importação de várias abas não esperar N × timeout. Depois da pausa
 * deixa passar UMA chamada de teste: sucesso fecha, falha reabre.
 */
export class Disjuntor {
  private falhasSeguidas = 0;
  private abertoAte = 0;
  private testeAte = 0;

  constructor(
    private readonly limiteFalhas: number,
    private readonly pausaMs: number,
    private readonly agora: () => number = Date.now,
  ) {}

  estado(): EstadoDisjuntor {
    if (this.abertoAte === 0) return 'fechado';
    return this.agora() < this.abertoAte ? 'aberto' : 'meio-aberto';
  }

  /** ms até a próxima tentativa possível (0 se pode chamar). */
  restanteMs(): number {
    const agora = this.agora();
    if (this.abertoAte > agora) return this.abertoAte - agora;
    if (this.testeAte > agora) return this.testeAte - agora;
    return 0;
  }

  podeChamar(): boolean {
    if (this.limiteFalhas <= 0 || this.abertoAte === 0) return true;
    const agora = this.agora();
    if (agora < this.abertoAte) return false;
    // Meio-aberto: uma chamada de teste por vez (a "licença" expira junto com a pausa).
    if (agora < this.testeAte) return false;
    this.testeAte = agora + this.pausaMs;
    return true;
  }

  sucesso(): void {
    this.falhasSeguidas = 0;
    this.abertoAte = 0;
    this.testeAte = 0;
  }

  /** Registra uma falha; devolve true se o disjuntor acabou de abrir. */
  falha(): boolean {
    if (this.limiteFalhas <= 0) return false;
    this.falhasSeguidas++;
    const estavaFechado = this.abertoAte === 0;
    if (this.falhasSeguidas >= this.limiteFalhas || !estavaFechado) {
      this.abertoAte = this.agora() + this.pausaMs;
      this.testeAte = 0;
      return estavaFechado;
    }
    return false;
  }

  resetar(): void {
    this.sucesso();
  }
}

const FORMATO_DIA = (() => {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return null;
  }
})();

/** Data (aaaa-mm-dd) em Brasília. */
export function diaDeBrasilia(ms: number): string {
  if (FORMATO_DIA) return FORMATO_DIA.format(new Date(ms));
  // Sem ICU: Brasília é UTC-3 (sem horário de verão desde 2019).
  return new Date(ms - 3 * 3600_000).toISOString().slice(0, 10);
}

/** ms até a próxima meia-noite de Brasília. */
export function msAteMeiaNoiteBrasilia(ms: number): number {
  const local = ms - 3 * 3600_000;
  const proxima = Math.floor(local / 86_400_000 + 1) * 86_400_000;
  return Math.max(1000, proxima - local);
}

export interface LimiteFamilia {
  /** 0 = sem limite. */
  porMinuto: number;
  /** 0 = sem limite. */
  porDia: number;
}

export type ConsumoLimite =
  | { ok: true }
  | { ok: false; motivo: 'LIMITE_TAXA' | 'COTA_EXCEDIDA'; retryAfterMs: number; escopo: 'usuario' | 'global' };

export interface ConfigLimitador {
  limiteDaFamilia: (familia: string) => LimiteFamilia;
  /** Chamadas por dia somando todos os usuários (0 = sem limite). */
  diaGlobal: number;
  /** Tokens por dia somando todos os usuários (0 = sem limite). */
  tokensDiaGlobal: number;
}

/**
 * Limites por (usuário, família): janela deslizante de 1 minuto e contador
 * diário; mais teto global diário de chamadas e de tokens (custo).
 */
export class LimitadorIa {
  private readonly janelas = new Map<string, number[]>();
  private readonly diarios = new Map<string, number>();
  private dia = '';
  private chamadasHoje = 0;
  private tokensHoje = 0;

  constructor(
    private readonly config: ConfigLimitador,
    private readonly agora: () => number = Date.now,
  ) {}

  private virarDia(agora: number) {
    const hoje = diaDeBrasilia(agora);
    if (hoje !== this.dia) {
      this.dia = hoje;
      this.diarios.clear();
      this.chamadasHoje = 0;
      this.tokensHoje = 0;
    }
  }

  /** Verifica e, se couber, consome uma chamada. */
  consumir(usuario: string, familia: string): ConsumoLimite {
    const agora = this.agora();
    this.virarDia(agora);
    const ateMeiaNoite = msAteMeiaNoiteBrasilia(agora);
    if (this.config.diaGlobal > 0 && this.chamadasHoje >= this.config.diaGlobal) {
      return { ok: false, motivo: 'COTA_EXCEDIDA', retryAfterMs: ateMeiaNoite, escopo: 'global' };
    }
    if (this.config.tokensDiaGlobal > 0 && this.tokensHoje >= this.config.tokensDiaGlobal) {
      return { ok: false, motivo: 'COTA_EXCEDIDA', retryAfterMs: ateMeiaNoite, escopo: 'global' };
    }
    const lim = this.config.limiteDaFamilia(familia);
    const chave = `${familia}|${usuario}`;
    const usadosHoje = this.diarios.get(chave) ?? 0;
    if (lim.porDia > 0 && usadosHoje >= lim.porDia) {
      return { ok: false, motivo: 'COTA_EXCEDIDA', retryAfterMs: ateMeiaNoite, escopo: 'usuario' };
    }
    if (lim.porMinuto > 0) {
      const janela = (this.janelas.get(chave) ?? []).filter((t) => agora - t < 60_000);
      if (janela.length >= lim.porMinuto) {
        this.janelas.set(chave, janela);
        return { ok: false, motivo: 'LIMITE_TAXA', retryAfterMs: 60_000 - (agora - janela[0]!), escopo: 'usuario' };
      }
      janela.push(agora);
      this.janelas.set(chave, janela);
    }
    this.diarios.set(chave, usadosHoje + 1);
    this.chamadasHoje++;
    this.limparJanelas(agora);
    return { ok: true };
  }

  registrarTokens(n: number): void {
    this.virarDia(this.agora());
    if (Number.isFinite(n) && n > 0) this.tokensHoje += n;
  }

  /** Evita crescimento sem fim do mapa de janelas (usuários que não voltaram). */
  private limparJanelas(agora: number) {
    if (this.janelas.size < 2000) return;
    for (const [k, v] of this.janelas) if (v.every((t) => agora - t >= 60_000)) this.janelas.delete(k);
  }

  estado(): { dia: string; chamadasHoje: number; tokensHoje: number; limiteChamadasDia: number; limiteTokensDia: number } {
    this.virarDia(this.agora());
    return {
      dia: this.dia,
      chamadasHoje: this.chamadasHoje,
      tokensHoje: this.tokensHoje,
      limiteChamadasDia: this.config.diaGlobal,
      limiteTokensDia: this.config.tokensDiaGlobal,
    };
  }

  resetar(): void {
    this.janelas.clear();
    this.diarios.clear();
    this.dia = '';
    this.chamadasHoje = 0;
    this.tokensHoje = 0;
  }
}
