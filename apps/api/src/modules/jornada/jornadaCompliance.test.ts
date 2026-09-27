import { describe, expect, it } from 'vitest';
import type { RegistroJornada, TipoEventoJornada } from '@rigabras/shared';
import { avaliarSessao, construirSessoesJornada } from './jornadaCompliance.js';

const MOTORISTA_ID = '018f2b3a-0000-7000-8000-000000000001';
const BASE = new Date('2026-09-01T08:00:00.000Z').getTime();

let seq = 0;
function evento(tipo: TipoEventoJornada, offsetMinutos: number): RegistroJornada {
  seq += 1;
  return {
    id: `018f2b3a-0000-7000-8000-00000000${String(seq).padStart(4, '0')}`,
    motorista_id: MOTORISTA_ID,
    viagem_id: null,
    tipo_evento: tipo,
    timestamp_evento: new Date(BASE + offsetMinutos * 60_000).toISOString(),
    latitude: null,
    longitude: null,
    observacoes: null,
    created_by: null,
    created_at: new Date(BASE + offsetMinutos * 60_000).toISOString(),
    deleted_at: null,
  };
}

describe('Módulo 4 — jornadaCompliance (ADI 5322)', () => {
  it('conta tempo de espera como jornada, sem descontar do total (regra central da ADI 5322)', () => {
    const eventos = [
      evento('INICIO_JORNADA', 0),
      evento('INICIO_ESPERA', 10),
      evento('FIM_ESPERA', 70), // 60 min de espera
      evento('INICIO_DIRECAO', 70),
      evento('FIM_DIRECAO', 130), // 60 min de direção
      evento('FIM_JORNADA', 140),
    ];

    const [sessao] = construirSessoesJornada(eventos, new Date(BASE + 200 * 60_000));
    expect(sessao).toBeDefined();
    expect(sessao!.aberta).toBe(false);
    // Jornada total = diferença bruta entre início e fim (140 min), NUNCA
    // "jornada útil" descontando a espera — é exatamente esse o erro que a
    // ADI 5322 corrige (tempo de espera conta como jornada).
    expect(sessao!.tempo_jornada_minutos).toBe(140);
    expect(sessao!.tempo_espera_minutos).toBe(60);
    expect(sessao!.tempo_direcao_minutos).toBe(60);

    const achados = avaliarSessao(sessao!);
    const achadoEspera = achados.find((a) => a.campo === 'tempo_espera_minutos');
    expect(achadoEspera?.severidade).toBe('INFO');
    expect(achadoEspera?.mensagem).toMatch(/ADI 5322/);
  });

  it('sinaliza descanso fracionado como violação BLOQUEANTE mesmo quando a soma das pausas atinge 11h', () => {
    const eventos = [
      evento('INICIO_JORNADA', 0),
      evento('INICIO_DIRECAO', 0),
      evento('FIM_DIRECAO', 60),
      evento('INICIO_DESCANSO', 60),
      evento('FIM_DESCANSO', 60 + 360), // bloco de 6h
      evento('INICIO_DIRECAO', 60 + 360),
      evento('FIM_DIRECAO', 60 + 360 + 30),
      evento('INICIO_DESCANSO', 60 + 360 + 30),
      evento('FIM_DESCANSO', 60 + 360 + 30 + 360), // outro bloco de 6h (soma = 12h, nenhum bloco >= 11h)
      evento('FIM_JORNADA', 60 + 360 + 30 + 360 + 10),
    ];

    const [sessao] = construirSessoesJornada(eventos);
    expect(sessao!.tempo_descanso_minutos).toBe(720); // 12h somadas
    expect(sessao!.maior_bloco_descanso_minutos).toBe(360); // maior bloco isolado: 6h

    const achados = avaliarSessao(sessao!);
    const achadoFragmentado = achados.find((a) => a.campo === 'tempo_descanso_minutos');
    expect(achadoFragmentado).toBeDefined();
    expect(achadoFragmentado?.severidade).toBe('BLOQUEANTE');
    expect(achadoFragmentado?.mensagem).toMatch(/fracionad|fragmentad/i);
  });

  it('NÃO sinaliza fragmentação quando o descanso é um único bloco contínuo >= 11h', () => {
    const eventos = [
      evento('INICIO_JORNADA', 0),
      evento('INICIO_DESCANSO', 30),
      evento('FIM_DESCANSO', 30 + 11 * 60), // um único bloco de 11h
      evento('FIM_JORNADA', 30 + 11 * 60 + 5),
    ];

    const [sessao] = construirSessoesJornada(eventos);
    expect(sessao!.maior_bloco_descanso_minutos).toBe(11 * 60);
    const achados = avaliarSessao(sessao!);
    expect(achados.find((a) => a.campo === 'tempo_descanso_minutos')).toBeUndefined();
  });

  it('sinaliza descanso insuficiente ENTRE duas jornadas consecutivas (< 11h, mínimo ADI 5322)', () => {
    const eventos = [
      evento('INICIO_JORNADA', 0),
      evento('FIM_JORNADA', 600), // 10h de jornada
      evento('INICIO_JORNADA', 600 + 8 * 60), // apenas 8h de descanso até a próxima jornada
      evento('FIM_JORNADA', 600 + 8 * 60 + 300),
    ];

    const sessoes = construirSessoesJornada(eventos);
    expect(sessoes).toHaveLength(2);
    expect(sessoes[0]!.descanso_seguinte_minutos).toBe(8 * 60);

    const achados = avaliarSessao(sessoes[0]!);
    const achadoDescansoCurto = achados.find((a) => a.campo === 'descanso_seguinte_minutos');
    expect(achadoDescansoCurto?.severidade).toBe('BLOQUEANTE');
  });

  it('sinaliza excesso de tempo de direção (> 10h, Lei 13.103/2015) e de jornada total (> 13h)', () => {
    const eventos = [
      evento('INICIO_JORNADA', 0),
      evento('INICIO_DIRECAO', 0),
      evento('FIM_DIRECAO', 11 * 60), // 11h de direção contínua
      evento('FIM_JORNADA', 14 * 60), // 14h de jornada total
    ];

    const [sessao] = construirSessoesJornada(eventos);
    const achados = avaliarSessao(sessao!);
    expect(achados.find((a) => a.campo === 'tempo_direcao_minutos')?.severidade).toBe('AVISO');
    expect(achados.find((a) => a.campo === 'tempo_jornada_minutos')?.severidade).toBe('BLOQUEANTE');
  });

  it('mantém uma sessão em aberto (sem FIM_JORNADA) computando os tempos até "agora", para alertas em tempo real', () => {
    const eventos = [evento('INICIO_JORNADA', 0), evento('INICIO_DIRECAO', 0)];
    const agora = new Date(BASE + 90 * 60_000); // 1h30 depois do início, ainda dirigindo

    const [sessao] = construirSessoesJornada(eventos, agora);
    expect(sessao!.aberta).toBe(true);
    expect(sessao!.fim_jornada).toBeNull();
    expect(sessao!.tempo_jornada_minutos).toBe(90);
    expect(sessao!.tempo_direcao_minutos).toBe(90); // segmento de direção ainda aberto, estendido até "agora"
  });
});
