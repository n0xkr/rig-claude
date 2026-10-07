import { beforeAll, describe, expect, it } from 'vitest';
import type { ChatbotService } from './chatbot.service.js';

// Banco em memória (config/fakeSupabase.ts): definido ANTES de importar o
// service, pois `config/env.ts` e `config/supabase.ts` leem ambiente no import.
process.env.USE_FAKE_DB = 'true';
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'fatal';

let Service: typeof ChatbotService;
let service: ChatbotService;

beforeAll(async () => {
  const mod = await import('./chatbot.service.js');
  Service = mod.ChatbotService;
  service = new Service();
});

describe('ChatbotService.montarSnapshot (registry de fontes da IA)', () => {
  it('inclui a fonte redes de contenção no snapshot e nos rótulos exibidos', async () => {
    const { snapshot, fontesDados } = await service.montarSnapshot();

    expect(snapshot).toHaveProperty('redes');
    const redes = snapshot.redes as Record<string, unknown>;
    expect(typeof redes.total).toBe('number');
    expect(typeof redes.checklistConcluidos).toBe('number');
    expect(typeof redes.checklistPendentes).toBe('number');

    expect(fontesDados.some((f) => f.includes('redes de contenção'))).toBe(true);
  });

  it('mantém as fontes históricas e deriva fontesDados do registry (sem lista hardcoded)', async () => {
    const { snapshot, fontesDados } = await service.montarSnapshot();

    expect(snapshot).toHaveProperty('viagens');
    expect(snapshot).toHaveProperty('financeiroFrete');
    expect(snapshot).toHaveProperty('portaria');
    expect(snapshot).toHaveProperty('frota');
    expect(snapshot).toHaveProperty('warehouse');
    expect(snapshot).toHaveProperty('jornada');
    expect(snapshot).toHaveProperty('riscos');
    expect(snapshot).toHaveProperty('cadastros');

    expect(fontesDados).toContain('viagens (TMS)');
    expect(fontesDados).toContain('fretes (financeiro)');
    expect(fontesDados).toContain('eventos de risco (gerenciamento de risco)');
    expect(fontesDados.some((f) => f.includes('cobertura automática'))).toBe(true);
  });

  it('tem cobertura automática de tabelas novas (demaisTabelas) no snapshot', async () => {
    const { snapshot } = await service.montarSnapshot();

    const demais = snapshot.demaisTabelas as Record<string, unknown[]>;
    expect(demais).toBeDefined();
    // seed do banco fake inclui armazens (tabela sem fonte dedicada)
    expect(Object.keys(demais).length).toBeGreaterThan(0);
    expect(demais.armazens).toBeDefined();
  });

  it('isola falha de uma fonte: fontesComErro no snapshot, rótulo fora de fontesDados', async () => {
    const comFalha = new Service({
      redes: {
        kpis: () => Promise.reject(new Error('redes fora do ar')),
      } as never,
    });

    const { snapshot, fontesDados } = await comFalha.montarSnapshot();

    expect(snapshot.fontesComErro).toContain('redes');
    expect(snapshot.redes).toEqual({ erro: expect.stringContaining('redes fora do ar') });
    expect(fontesDados.some((f) => f.includes('redes de contenção'))).toBe(false);

    // as demais fontes continuam respondendo
    expect(snapshot).toHaveProperty('viagens');
    expect(fontesDados).toContain('viagens (TMS)');
  });
});
