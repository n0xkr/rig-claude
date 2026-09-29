import { CreateManutencaoVeiculoSchema, CreateViagemSchema } from '@rigabras/shared';
import type {
  CommitImportacaoResult,
  ImportDataset,
  ImportLinhaErro,
  ImportTarget,
  OrigemImportacao,
  ValidarImportacaoResult,
} from '@rigabras/shared';
import { IMPORT_TARGET_FIELDS } from '@rigabras/shared';
import { ImportacaoRepository } from './importacao.repository.js';
import { writeAuditLog } from '../../lib/auditLog.js';

const TARGET_SCHEMA = {
  viagens: CreateViagemSchema,
  manutencoes_veiculo: CreateManutencaoVeiculoSchema,
} as const;

/**
 * Coage o valor bruto vindo da planilha (string/número/Date do SheetJS) para
 * o tipo esperado pelo campo, ANTES da validação Zod real — a planilha nunca
 * é fonte de verdade sobre tipos (critério "nunca considerar dado externo
 * como verdade absoluta", mesmo racional do OCR na Portaria). Uma célula
 * vazia vira `undefined` (campo omitido), nunca uma string vazia, para que
 * campos opcionais não falhem validação por engano.
 */
function coagirValor(raw: unknown, type: 'text' | 'number' | 'boolean' | 'date' | 'datetime' | 'enum'): unknown {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw === 'string' && raw.trim() === '') return undefined;

  switch (type) {
    case 'number': {
      if (typeof raw === 'number') return raw;
      const parsed = Number(String(raw).replace(',', '.').trim());
      return Number.isNaN(parsed) ? raw : parsed;
    }
    case 'boolean': {
      if (typeof raw === 'boolean') return raw;
      const normalized = String(raw).trim().toLowerCase();
      return ['true', '1', 'sim', 'yes'].includes(normalized);
    }
    case 'date':
    case 'datetime': {
      let date: Date | null = null;
      if (raw instanceof Date) date = raw;
      else if (typeof raw === 'number') {
        // Serial de data do Excel (dias desde 1899-12-30).
        date = new Date(Date.UTC(1899, 11, 30) + raw * 86400000);
      } else {
        const str = String(raw).trim();
        const brMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
        if (brMatch) {
          const [, d, m, y] = brMatch;
          const year = y.length === 2 ? `20${y}` : y;
          date = new Date(Date.UTC(Number(year), Number(m) - 1, Number(d)));
        } else {
          const parsed = new Date(str);
          if (!Number.isNaN(parsed.getTime())) date = parsed;
        }
      }
      if (!date || Number.isNaN(date.getTime())) return raw;
      return type === 'date' ? date.toISOString().slice(0, 10) : date.toISOString();
    }
    case 'enum':
      return String(raw).trim().toUpperCase();
    case 'text':
    default:
      return typeof raw === 'string' ? raw.trim() : String(raw);
  }
}

/**
 * Erros do PostgREST são objetos simples (não `Error`) com `code`/`message`:
 * traduz as violações de constraint mais comuns em mensagens úteis.
 */
function mensagemErroBanco(err: unknown): string {
  const e = err as { code?: string; message?: string; details?: string } | null;
  switch (e?.code) {
    case '23505':
      return `Registro duplicado (já existe): ${e.details ?? e.message ?? 'valor único repetido'}`;
    case '23503':
      return `Referência inválida (registro relacionado não existe): ${e.details ?? e.message ?? ''}`.trim();
    case '23514':
      return `Valor fora das regras do banco: ${e.message ?? 'violação de check constraint'}`;
    default:
      return e?.message ?? 'Falha ao gravar registro';
  }
}

export class ImportacaoService {
  constructor(private readonly repo: ImportacaoRepository = new ImportacaoRepository()) {}

  /**
   * Coage e valida cada linha contra o `Create*Schema` real do alvo
   * (o mesmo usado pelos formulários), resolvendo a FK `placa -> veiculo_id`
   * quando o alvo exige (`manutencoes_veiculo`). NUNCA grava nada — usado
   * tanto pela pré-visualização quanto como primeiro passo do commit.
   */
  private async coagirEValidarLinhas(
    target: ImportTarget,
    linhas: Array<Record<string, unknown>>,
  ): Promise<{ validas: Array<{ linha: number; dados: Record<string, unknown> }>; erros: ImportLinhaErro[] }> {
    const campos = IMPORT_TARGET_FIELDS[target];
    const schema = TARGET_SCHEMA[target];
    const validas: Array<{ linha: number; dados: Record<string, unknown> }> = [];
    const erros: ImportLinhaErro[] = [];
    // Uma placa costuma se repetir em várias linhas: evita 1 query por linha.
    const cachePlacas = new Map<string, string | null>();
    const resolverVeiculo = async (placa: string): Promise<string | null> => {
      if (!cachePlacas.has(placa)) cachePlacas.set(placa, await this.repo.findVeiculoIdByPlaca(placa));
      return cachePlacas.get(placa) ?? null;
    };

    for (let i = 0; i < linhas.length; i++) {
      const linhaNum = i + 1;
      const linhaBruta = linhas[i]!;
      const coagida: Record<string, unknown> = {};
      for (const campo of campos) {
        if (campo.key === 'placa') continue; // resolvido separadamente abaixo
        coagida[campo.key] = coagirValor(linhaBruta[campo.key], campo.type);
      }

      if (target === 'manutencoes_veiculo') {
        const placa = linhaBruta.placa;
        if (!placa || String(placa).trim() === '') {
          erros.push({ linha: linhaNum, campo: 'placa', mensagem: 'Placa não informada' });
          continue;
        }
        const placaNormalizada = String(placa).trim().toUpperCase();
        const veiculoId = await resolverVeiculo(placaNormalizada);
        if (!veiculoId) {
          erros.push({
            linha: linhaNum,
            campo: 'placa',
            mensagem: `Nenhum veículo cadastrado com a placa "${placaNormalizada}"`,
          });
          continue;
        }
        coagida.veiculo_id = veiculoId;
      }

      if (target === 'viagens' && typeof coagida.placa_cavalo === 'string') {
        // viagens.placa_cavalo é FK para veiculos.placa (exata, maiúscula): sem veículo
        // cadastrado o insert falharia no banco (23503), então valida aqui com msg clara.
        const placa = coagida.placa_cavalo.toUpperCase();
        const veiculoId = await resolverVeiculo(placa);
        if (!veiculoId) {
          erros.push({
            linha: linhaNum,
            campo: 'placa_cavalo',
            mensagem: `Nenhum veículo cadastrado com a placa "${placa}"`,
          });
          continue;
        }
        coagida.placa_cavalo = placa;
        coagida.veiculo_id = veiculoId;
      }

      const result = schema.safeParse(coagida);
      if (!result.success) {
        for (const issue of result.error.issues) {
          erros.push({
            linha: linhaNum,
            campo: issue.path.join('.') || null,
            mensagem: issue.message,
          });
        }
        continue;
      }
      validas.push({ linha: linhaNum, dados: result.data as Record<string, unknown> });
    }

    return { validas, erros };
  }

  async validar(
    target: ImportTarget,
    linhas: Array<Record<string, unknown>>,
  ): Promise<ValidarImportacaoResult> {
    const { validas, erros } = await this.coagirEValidarLinhas(target, linhas);
    return {
      totalLinhas: linhas.length,
      linhasValidas: validas.length,
      linhasComErro: linhas.length - validas.length,
      erros,
    };
  }

  /**
   * Importa de fato: valida novamente (nunca confia em uma validação prévia
   * do cliente), grava linha a linha para isolar falhas de constraint do
   * Postgres (ex: `numero_crt` duplicado) que o Zod não captura, e sempre
   * registra o dataset — mesmo quando 0 linhas entram — para nunca perder o
   * histórico de uma tentativa de importação.
   */
  async importar(
    target: ImportTarget,
    nome: string,
    origem: OrigemImportacao,
    linhas: Array<Record<string, unknown>>,
    userId: string | null,
    ip: string | null,
  ): Promise<CommitImportacaoResult> {
    const { validas, erros } = await this.coagirEValidarLinhas(target, linhas);

    const dataset = await this.repo.createDataset(nome, target, origem, userId);

    let importadas = 0;
    const errosCommit: ImportLinhaErro[] = [...erros];
    for (const { linha, dados } of validas) {
      try {
        await this.repo.bulkInsert(target, [{ ...dados, created_by: userId }]);
        importadas++;
      } catch (err) {
        errosCommit.push({ linha, campo: null, mensagem: mensagemErroBanco(err) });
      }
    }

    const atualizado = await this.repo.updateDatasetResultado(
      dataset.id,
      linhas.length,
      importadas,
      linhas.length - importadas,
    );

    await writeAuditLog({
      userId,
      action: 'CREATE',
      entity: 'import_datasets',
      entityId: atualizado.id,
      changes: { after: atualizado, resumo: { importadas, erros: errosCommit.length } },
      ip,
    });

    return { dataset: atualizado, erros: errosCommit };
  }

  listDatasets(): Promise<ImportDataset[]> {
    return this.repo.listDatasets();
  }
}
