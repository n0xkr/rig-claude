import type { RespostaChatbot } from '@rigabras/shared';
import { askOperationalQuestion } from '../groq/groq.client.js';
import { criarFontes, type DependenciasFontes, type FonteIa } from './fontes.js';

/**
 * RIGABRAS AI (Módulo 10): monta um snapshot operacional AO VIVO a partir
 * de um registry de fontes (`fontes.ts`), cobrindo todos os módulos já
 * existentes + cobertura automática de tabelas novas. A "regra de ouro"
 * (seção 29 do documento de evolução) é reforçada estruturalmente aqui:
 * o modelo nunca vê o banco de dados diretamente, só este snapshot já
 * validado.
 *
 * Falha de UMA fonte não derruba a pergunta: `Promise.allSettled` isola a
 * fonte, ela é registrada em `fontesComErro` no snapshot e fica de fora de
 * `fontesDados` (exibidas ao usuário em "Fontes:").
 */
export class ChatbotService {
  private readonly fontes: FonteIa[];

  constructor(deps: DependenciasFontes = {}) {
    this.fontes = criarFontes(deps);
  }

  async montarSnapshot(): Promise<{ snapshot: Record<string, unknown>; fontesDados: string[] }> {
    const resultados = await Promise.allSettled(this.fontes.map((f) => f.coletar()));

    const snapshot: Record<string, unknown> = { geradoEm: new Date().toISOString() };
    const fontesDados: string[] = [];
    const fontesComErro: string[] = [];

    resultados.forEach((resultado, i) => {
      const fonte = this.fontes[i]!;
      if (resultado.status === 'fulfilled') {
        snapshot[fonte.chave] = resultado.value;
        fontesDados.push(fonte.rotulo);
      } else {
        snapshot[fonte.chave] = { erro: String(resultado.reason) };
        fontesComErro.push(fonte.chave);
      }
    });

    if (fontesComErro.length > 0) snapshot.fontesComErro = fontesComErro;
    return { snapshot, fontesDados };
  }

  async perguntar(pergunta: string): Promise<RespostaChatbot> {
    const { snapshot, fontesDados } = await this.montarSnapshot();
    const resposta = await askOperationalQuestion(pergunta, JSON.stringify(snapshot, null, 2));
    return {
      resposta,
      fontesDados,
      geradoEm: snapshot.geradoEm as string,
    };
  }
}
