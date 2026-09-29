import { z } from 'zod';

/**
 * Importação inteligente: o usuário só envia as planilhas. O sistema descobre
 * sozinho o que cada aba é, mapeia as colunas pelo nome (dicionário + IA),
 * cruza as abas entre si (viagem ↔ motorista ↔ veículo ↔ checklist/SMP/
 * consulta ↔ CRT/DANFE) e grava tudo consolidado. Nenhum mapeamento manual.
 */

/** O que uma aba representa. */
export const TipoAbaImportacaoSchema = z.enum([
  'viagens',
  'veiculos',
  'motoristas',
  'clientes',
  'cargas',
  'checklists',
  'smp',
  'consultas',
  'ignorada',
]);
export type TipoAbaImportacao = z.infer<typeof TipoAbaImportacaoSchema>;

export const TIPO_ABA_IMPORTACAO_LABEL: Record<TipoAbaImportacao, string> = {
  viagens: 'Viagens',
  veiculos: 'Veículos',
  motoristas: 'Motoristas',
  clientes: 'Clientes',
  cargas: 'Documentos de carga (CRT/DANFE)',
  checklists: 'Checklists (cruzados com as viagens)',
  smp: 'SMP (cruzadas com as viagens)',
  consultas: 'Pesquisas/consultas GR (cruzadas com as viagens)',
  ignorada: 'Sem dados para o sistema',
};

/** Célula como o navegador entrega: só valores primitivos (nunca objetos/arrays). */
export const CelulaImportacaoSchema = z.union([z.string().max(20000), z.number(), z.boolean(), z.null()]);

export const AbaImportacaoInputSchema = z.object({
  nome: z.string().min(1).max(200),
  cabecalhos: z.array(z.string().max(500)).max(400),
  linhas: z.array(z.record(z.string().max(500), CelulaImportacaoSchema)).max(20000),
});
export type AbaImportacaoInput = z.infer<typeof AbaImportacaoInputSchema>;

export const ImportacaoInteligenteInputSchema = z.object({
  /** `previa` calcula tudo sem gravar; `gravar` executa. */
  modo: z.enum(['previa', 'gravar']),
  arquivos: z
    .array(
      z.object({
        nome: z.string().min(1).max(300),
        abas: z.array(AbaImportacaoInputSchema).max(80),
      }),
    )
    .min(1)
    .max(10),
});
export type ImportacaoInteligenteInput = z.infer<typeof ImportacaoInteligenteInputSchema>;

export interface ColunaInterpretada {
  coluna: string;
  /** Campo do sistema; null = guardada como informação extra da viagem/cadastro. */
  campo: string | null;
  rotulo: string | null;
  origem: 'dicionario' | 'ia' | 'extra' | 'ignorada';
  /** Resultado da padronização (etapa 1): tipo detectado olhando a coluna inteira. */
  tipo?: 'vazio' | 'booleano' | 'hora' | 'data' | 'datahora' | 'placa' | 'placas' | 'numero' | 'codigo' | 'texto';
  formato?: string | null;
  preenchidas?: number;
  distintos?: number;
  exemplos?: string[];
  /** Células convertidas para a forma padrão ("10.781,00" -> 10781). */
  convertidas?: number;
  /** Células que não se encaixam no tipo da coluna (mantidas como texto). */
  inconsistencias?: number;
  exemplosInconsistencia?: Array<{ linha: number; valor: string }>;
}

export interface AbaInterpretada {
  arquivo: string;
  aba: string;
  tipo: TipoAbaImportacao;
  origemTipo: 'dicionario' | 'ia' | 'nome';
  linhas: number;
  colunas: ColunaInterpretada[];
  observacao?: string;
  /** Linhas removidas na padronização (vazias, cabeçalho repetido, total), com o motivo. */
  descartadas?: Array<{ linha: number; motivo: string }>;
  /** Linhas idênticas a outra da mesma aba. */
  duplicadas?: number;
}

export interface ContagemEntidade {
  novos: number;
  atualizados: number;
  iguais: number;
  erros: number;
}

export interface ViagemConsolidadaPrevia {
  acao: 'criar' | 'atualizar' | 'igual';
  chave: string;
  placa_cavalo: string;
  placa_carreta?: string | null;
  motorista?: string | null;
  cliente?: string | null;
  origem: string;
  destino: string;
  status: string;
  data_programacao?: string | null;
  documentos: string[];
  pesquisa_ok?: boolean;
  checklist_ok?: boolean;
  smp_ok?: boolean;
  fontes: string[];
}

export interface ImportacaoInteligenteResultado {
  modo: 'previa' | 'gravar';
  lote_id: string | null;
  ia_disponivel: boolean;
  abas: AbaInterpretada[];
  totais: {
    viagens: ContagemEntidade;
    veiculos: ContagemEntidade;
    motoristas: ContagemEntidade;
    clientes: ContagemEntidade;
    cargas: ContagemEntidade;
  };
  cruzamentos: {
    viagens_com_motorista: number;
    viagens_com_carreta: number;
    viagens_com_documentos: number;
    pesquisa_ok: number;
    checklist_ok: number;
    smp_ok: number;
    status_deduzidos: number;
  };
  viagens: ViagemConsolidadaPrevia[];
  erros: Array<{ arquivo: string; aba: string; linha: number | null; mensagem: string }>;
  avisos: string[];
}
