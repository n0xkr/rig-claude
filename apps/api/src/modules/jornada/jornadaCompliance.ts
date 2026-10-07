import type { AchadoConformidadeJornada, RegistroJornada, SessaoJornada } from '@rigabras/shared';

/**
 * Motor de conformidade da ADI 5322 (Módulo 4, "Controle de Jornada") — regras
 * de negócio puras, sem qualquer acesso a banco/HTTP (critério #1), para
 * poderem ser testadas isoladamente (critério #10). Reconstrói sessões de
 * jornada (INICIO_JORNADA -> FIM_JORNADA, ou ainda em aberto) a partir do log
 * contínuo e imutável de eventos, e avalia cada sessão contra as regras da
 * ADI 5322:
 *   1. Tempo de espera CONTA como jornada — nunca é descontado do total (por
 *      construção: `tempo_jornada_minutos` é sempre a diferença bruta entre
 *      início e fim, jamais um cálculo que exclui a espera).
 *   2. Descanso mínimo de 11h consecutivas, NÃO fracionável — soma de pausas
 *      curtas que juntas alcançam 11h não substitui um único bloco contínuo.
 *
 * Constantes de limite legal, documentadas por citação — mudanças na
 * legislação exigem apenas alterar estas constantes, nunca a lógica:
 */
export const DESCANSO_MINIMO_MINUTOS = 11 * 60; // ADI 5322: repouso mínimo de 11h consecutivas, não fracionável.
export const JORNADA_MAXIMA_MINUTOS = 13 * 60; // 24h - 11h de descanso obrigatório = janela útil máxima de 13h (direção + espera + intervalos).
export const DIRECAO_MAXIMA_MINUTOS = 10 * 60; // Lei 13.103/2015 (Lei do Motorista): 8h de direção + até 2h de prorrogação.

type TipoSegmento = 'DIRECAO' | 'ESPERA' | 'DESCANSO';

interface SegmentoAberto {
  tipo: TipoSegmento;
  inicio: Date;
}

interface Acumulador {
  eventoInicio: RegistroJornada | null;
  eventos: RegistroJornada[];
  segmentoAberto: SegmentoAberto | null;
  tempoDirecaoMin: number;
  tempoEsperaMin: number;
  tempoDescansoMin: number;
  blocosDescanso: number[];
}

function novoAcumulador(): Acumulador {
  return {
    eventoInicio: null,
    eventos: [],
    segmentoAberto: null,
    tempoDirecaoMin: 0,
    tempoEsperaMin: 0,
    tempoDescansoMin: 0,
    blocosDescanso: [],
  };
}

function timestampOf(evento: RegistroJornada): Date {
  return new Date(evento.timestamp_evento ?? evento.created_at ?? new Date().toISOString());
}

function diffMinutes(inicio: Date, fim: Date): number {
  return Math.max(0, Math.round((fim.getTime() - inicio.getTime()) / 60000));
}

function fecharSegmento(acc: Acumulador, fimTs: Date): void {
  if (!acc.segmentoAberto) return;
  const duracao = diffMinutes(acc.segmentoAberto.inicio, fimTs);
  if (acc.segmentoAberto.tipo === 'DIRECAO') acc.tempoDirecaoMin += duracao;
  else if (acc.segmentoAberto.tipo === 'ESPERA') acc.tempoEsperaMin += duracao;
  else {
    acc.tempoDescansoMin += duracao;
    acc.blocosDescanso.push(duracao);
  }
  acc.segmentoAberto = null;
}

function finalizarSessao(
  acc: Acumulador,
  fimEvento: RegistroJornada | null,
  now: Date,
): SessaoJornada {
  const inicioTs = acc.eventoInicio ? timestampOf(acc.eventoInicio) : null;
  const fimTs = fimEvento ? timestampOf(fimEvento) : null;
  const tempoJornadaMinutos = inicioTs ? diffMinutes(inicioTs, fimTs ?? now) : null;
  const maiorBloco = acc.blocosDescanso.length > 0 ? Math.max(...acc.blocosDescanso) : 0;

  return {
    motorista_id: acc.eventos[0]?.motorista_id ?? '',
    aberta: fimEvento === null,
    inicio_jornada: inicioTs ? inicioTs.toISOString() : null,
    fim_jornada: fimTs ? fimTs.toISOString() : null,
    tempo_jornada_minutos: tempoJornadaMinutos,
    tempo_direcao_minutos: acc.tempoDirecaoMin,
    tempo_espera_minutos: acc.tempoEsperaMin,
    tempo_descanso_minutos: acc.tempoDescansoMin,
    maior_bloco_descanso_minutos: maiorBloco,
    descanso_seguinte_minutos: null, // preenchido no segundo passo, entre sessões consecutivas
    achados: [],
    eventos: acc.eventos,
  };
}

/**
 * Reconstrói as sessões de jornada de UM motorista a partir dos eventos
 * brutos, já ordenados ascendentemente por `timestamp_evento` (contrato desta
 * função — quem chama garante a ordenação, tipicamente vinda do repositório).
 * `now` é injetável para viabilizar testes determinísticos.
 */
export function construirSessoesJornada(
  eventosOrdenados: RegistroJornada[],
  now: Date = new Date(),
): SessaoJornada[] {
  const sessoes: SessaoJornada[] = [];
  let acc = novoAcumulador();
  let sessaoAberta = false;

  for (const evento of eventosOrdenados) {
    const ts = timestampOf(evento);
    switch (evento.tipo_evento) {
      case 'INICIO_JORNADA':
        acc = novoAcumulador();
        acc.eventoInicio = evento;
        acc.eventos.push(evento);
        sessaoAberta = true;
        break;
      case 'INICIO_DIRECAO':
        acc.eventos.push(evento);
        acc.segmentoAberto = { tipo: 'DIRECAO', inicio: ts };
        break;
      case 'INICIO_ESPERA':
        acc.eventos.push(evento);
        acc.segmentoAberto = { tipo: 'ESPERA', inicio: ts };
        break;
      case 'INICIO_DESCANSO':
        acc.eventos.push(evento);
        acc.segmentoAberto = { tipo: 'DESCANSO', inicio: ts };
        break;
      case 'FIM_DIRECAO':
      case 'FIM_ESPERA':
      case 'FIM_DESCANSO':
        fecharSegmento(acc, ts);
        acc.eventos.push(evento);
        break;
      case 'FIM_JORNADA':
        fecharSegmento(acc, ts); // fecha segmento pendente, se houver (proteção defensiva contra dado inconsistente)
        acc.eventos.push(evento);
        sessoes.push(finalizarSessao(acc, evento, now));
        sessaoAberta = false;
        acc = novoAcumulador();
        break;
    }
  }

  if (sessaoAberta && acc.eventos.length > 0) {
    fecharSegmento(acc, now); // estende o segmento em aberto até "agora", para monitoramento em tempo real
    sessoes.push(finalizarSessao(acc, null, now));
  }

  // Segundo passo: descanso ENTRE sessões fechadas consecutivas. Por
  // construção da máquina de estados (`PROXIMO_EVENTO_JORNADA_VALIDO`), o
  // único evento válido após FIM_JORNADA é um novo INICIO_JORNADA — logo esse
  // intervalo nunca é interrompido por outro tipo de evento (não pode ser
  // "fragmentado" por definição), apenas precisa atingir o mínimo de 11h.
  for (let i = 0; i < sessoes.length - 1; i++) {
    const atual = sessoes[i]!;
    const proxima = sessoes[i + 1]!;
    if (atual.fim_jornada && proxima.inicio_jornada) {
      atual.descanso_seguinte_minutos = diffMinutes(
        new Date(atual.fim_jornada),
        new Date(proxima.inicio_jornada),
      );
    }
  }

  return sessoes;
}

function formatHoras(minutos: number): string {
  const horas = Math.floor(minutos / 60);
  const min = minutos % 60;
  return `${horas}h${String(min).padStart(2, '0')}`;
}

/**
 * Avalia uma sessão de jornada contra as regras da ADI 5322 e retorna uma
 * lista estruturada de achados (campo/severidade/mensagem — mesmo padrão de
 * `AchadoValidacao` do Módulo 2), nunca apenas um booleano de conforme/não
 * conforme.
 */
export function avaliarSessao(sessao: SessaoJornada): AchadoConformidadeJornada[] {
  const achados: AchadoConformidadeJornada[] = [];

  if (!sessao.inicio_jornada && sessao.eventos.length > 0) {
    achados.push({
      campo: 'inicio_jornada',
      severidade: 'BLOQUEANTE',
      mensagem:
        'Sessão de jornada sem evento INICIO_JORNADA correspondente — verificar integridade dos dados.',
    });
    return achados;
  }

  if (sessao.tempo_espera_minutos > 0) {
    achados.push({
      campo: 'tempo_espera_minutos',
      severidade: 'INFO',
      mensagem: `Tempo de espera de ${formatHoras(sessao.tempo_espera_minutos)} incluído no total da jornada (conta como jornada — STF ADI 5322), nunca descontado.`,
    });
  }

  if (
    sessao.tempo_jornada_minutos != null &&
    sessao.tempo_jornada_minutos > JORNADA_MAXIMA_MINUTOS
  ) {
    achados.push({
      campo: 'tempo_jornada_minutos',
      severidade: 'BLOQUEANTE',
      mensagem: `Jornada de ${formatHoras(sessao.tempo_jornada_minutos)} excede o limite de ${formatHoras(JORNADA_MAXIMA_MINUTOS)} (considerando direção, espera e intervalos).`,
      valorEsperado: `<= ${formatHoras(JORNADA_MAXIMA_MINUTOS)}`,
      valorEncontrado: formatHoras(sessao.tempo_jornada_minutos),
    });
  }

  if (sessao.tempo_direcao_minutos > DIRECAO_MAXIMA_MINUTOS) {
    achados.push({
      campo: 'tempo_direcao_minutos',
      severidade: 'AVISO',
      mensagem: `Tempo de direção de ${formatHoras(sessao.tempo_direcao_minutos)} excede o limite de ${formatHoras(DIRECAO_MAXIMA_MINUTOS)} (8h + 2h de prorrogação — Lei 13.103/2015).`,
      valorEsperado: `<= ${formatHoras(DIRECAO_MAXIMA_MINUTOS)}`,
      valorEncontrado: formatHoras(sessao.tempo_direcao_minutos),
    });
  }

  if (
    sessao.tempo_descanso_minutos >= DESCANSO_MINIMO_MINUTOS &&
    sessao.maior_bloco_descanso_minutos < DESCANSO_MINIMO_MINUTOS
  ) {
    achados.push({
      campo: 'tempo_descanso_minutos',
      severidade: 'BLOQUEANTE',
      mensagem: `Descanso fragmentado: a soma das pausas atinge ${formatHoras(sessao.tempo_descanso_minutos)}, mas nenhum bloco contínuo alcança as ${formatHoras(DESCANSO_MINIMO_MINUTOS)} mínimas exigidas (repouso não fracionável — ADI 5322).`,
      valorEsperado: `1 bloco contínuo >= ${formatHoras(DESCANSO_MINIMO_MINUTOS)}`,
      valorEncontrado: `maior bloco contínuo: ${formatHoras(sessao.maior_bloco_descanso_minutos)}`,
    });
  }

  if (
    sessao.descanso_seguinte_minutos != null &&
    sessao.descanso_seguinte_minutos < DESCANSO_MINIMO_MINUTOS
  ) {
    achados.push({
      campo: 'descanso_seguinte_minutos',
      severidade: 'BLOQUEANTE',
      mensagem: `Descanso de apenas ${formatHoras(sessao.descanso_seguinte_minutos)} antes do início da próxima jornada, abaixo do mínimo de ${formatHoras(DESCANSO_MINIMO_MINUTOS)} não fracionável exigido pela ADI 5322.`,
      valorEsperado: `>= ${formatHoras(DESCANSO_MINIMO_MINUTOS)}`,
      valorEncontrado: formatHoras(sessao.descanso_seguinte_minutos),
    });
  }

  return achados;
}
