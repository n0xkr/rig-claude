import { randomUUID } from 'node:crypto';
import {
  OcrCnhSchema,
  OcrCrlvSchema,
  type EnviarDocumentosMotoristaInput,
  type MotoristaDocumento,
  type OcrCnh,
  type OcrCrlv,
  type OcrDocumentoInput,
  type OcrDocumentoResultado,
} from '@rigabras/shared';
import { supabaseAdmin } from '../../config/supabase.js';
import { logger } from '../../config/logger.js';
import { isGroqConfigured } from '../../config/env.js';
import { DomainError } from '../../lib/errors.js';
import { isSchemaAusente } from '../../lib/permissoes.js';
import { erroMigration0014 } from '../../lib/schemaPendente.js';
import { writeAuditLog } from '../../lib/auditLog.js';
import { completeJsonComImagens } from '../groq/groq.client.js';

const BUCKET = 'motoristas-documentos';
const TABELA = 'motorista_documentos';

// ---------------------------------------------------------------------------
// OCR (IA com visão)
// ---------------------------------------------------------------------------

const SYS_CNH = `Você lê fotos/digitalizações de CNH brasileira (Carteira Nacional de Habilitação, modelo
impresso ou CNH digital) e extrai os dados EXATAMENTE como impressos. Responda ESTRITAMENTE em JSON:
{"nome_completo": string|null, "cpf": string|null, "rg": string|null (doc. identidade + órgão emissor/UF),
 "data_nascimento": "dd/mm/aaaa"|null, "nome_mae": string|null, "nome_pai": string|null,
 "cnh": string|null (nº de registro, 11 dígitos), "cnh_categoria": string|null (ex. "E", "AE"),
 "cnh_validade": "dd/mm/aaaa"|null, "cnh_primeira_habilitacao": "dd/mm/aaaa"|null, "nacionalidade": string|null,
 "ilegiveis": [nomes dos campos que você não conseguiu ler com segurança]}
"Filiação" na CNH traz os nomes dos pais: o primeiro costuma ser o pai e o segundo a mãe — quando não der
para distinguir, coloque o nome feminino em nome_mae. Nunca invente: campo que não aparece = null.`;

const SYS_CRLV = `Você lê fotos/digitalizações de CRLV/CRLV-e brasileiro (documento do veículo) e extrai os
dados EXATAMENTE como impressos. Responda ESTRITAMENTE em JSON:
{"placa": string|null, "renavam": string|null, "chassi": string|null, "marca": string|null, "modelo": string|null,
 "ano_fabricacao": number|null, "ano_modelo": number|null, "especie_tipo": string|null (ex. "CARGA / SEMI-REBOQUE",
 "CARGA / CAMINHAO TRATOR"), "proprietario": string|null, "exercicio": string|null,
 "ilegiveis": [nomes dos campos que você não conseguiu ler com segurança]}
"Marca/Modelo" costuma vir junto (ex. "SCANIA/R 450 A6X2"): separe marca e modelo. Nunca invente.`;

function dataIso(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export function cpfValido(cpf: string): boolean {
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dig = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dig(9) === Number(d[9]) && dig(10) === Number(d[10]);
}

const limpo = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim().replace(/\s+/g, ' ') : null);

export async function lerDocumentoPorOcr(input: OcrDocumentoInput): Promise<OcrDocumentoResultado> {
  if (!isGroqConfigured)
    throw new DomainError(
      'Leitura automática indisponível',
      503,
      'A IA de leitura de documentos não está configurada neste servidor (GROQ_API_KEY). Preencha os dados manualmente.',
    );
  const imagens = input.imagens.filter((a) => a.mime.startsWith('image/'));
  if (imagens.length === 0)
    throw new DomainError('Envie imagens', 422, 'O OCR precisa de fotos (PDFs são convertidos em imagem pelo navegador).');
  let bruto: Record<string, unknown>;
  try {
    bruto = (await completeJsonComImagens(
      input.tipo === 'CNH' ? SYS_CNH : SYS_CRLV,
      input.tipo === 'CNH'
        ? 'Extraia os dados desta CNH (as imagens podem ser frente, verso ou páginas do mesmo documento).'
        : 'Extraia os dados deste CRLV.',
      imagens.map((a) => `data:${a.mime};base64,${a.base64}`),
    )) as Record<string, unknown>;
  } catch (err) {
    logger.warn({ err }, 'OCR de documento falhou');
    throw new DomainError(
      'Não foi possível ler o documento',
      502,
      'A IA não conseguiu ler as imagens. Tente fotos mais nítidas (documento inteiro, sem reflexo) ou preencha manualmente.',
    );
  }
  const ilegiveis = Array.isArray(bruto.ilegiveis) ? bruto.ilegiveis.map(String) : [];

  if (input.tipo === 'CNH') {
    const cpfDigitos = String(bruto.cpf ?? '').replace(/\D/g, '');
    const dados: OcrCnh = OcrCnhSchema.parse({
      nome_completo: limpo(bruto.nome_completo)?.toUpperCase() ?? null,
      cpf: cpfDigitos.length === 11 ? cpfDigitos : null,
      rg: limpo(bruto.rg),
      data_nascimento: dataIso(bruto.data_nascimento),
      nome_mae: limpo(bruto.nome_mae),
      nome_pai: limpo(bruto.nome_pai),
      cnh: String(bruto.cnh ?? '').replace(/\D/g, '') || null,
      cnh_categoria: limpo(bruto.cnh_categoria)?.toUpperCase().replace(/[^A-E]/g, '') || null,
      cnh_validade: dataIso(bruto.cnh_validade),
      cnh_primeira_habilitacao: dataIso(bruto.cnh_primeira_habilitacao),
      nacionalidade: limpo(bruto.nacionalidade),
    });
    if (dados.cpf && !cpfValido(dados.cpf)) {
      ilegiveis.push('cpf');
      dados.cpf = null;
    }
    const observacao =
      dados.cnh_validade && Date.parse(dados.cnh_validade) < Date.now() ? 'Atenção: CNH vencida.' : undefined;
    return { tipo: 'CNH', dados, ilegiveis: [...new Set(ilegiveis)], observacao };
  }

  const ano = (v: unknown) => {
    const n = Number(String(v ?? '').replace(/\D/g, ''));
    return n >= 1950 && n <= 2100 ? n : null;
  };
  const placa = String(bruto.placa ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const dados: OcrCrlv = OcrCrlvSchema.parse({
    placa: /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(placa) ? placa : null,
    renavam: String(bruto.renavam ?? '').replace(/\D/g, '') || null,
    chassi: limpo(bruto.chassi)?.toUpperCase() ?? null,
    marca: limpo(bruto.marca),
    modelo: limpo(bruto.modelo),
    ano_fabricacao: ano(bruto.ano_fabricacao),
    ano_modelo: ano(bruto.ano_modelo),
    especie_tipo: limpo(bruto.especie_tipo),
    proprietario: limpo(bruto.proprietario),
    exercicio: limpo(bruto.exercicio),
  });
  if (!dados.placa) ilegiveis.push('placa');
  return { tipo: 'CRLV', dados, ilegiveis: [...new Set(ilegiveis)] };
}

// ---------------------------------------------------------------------------
// Arquivos no Storage + registro em motorista_documentos
// ---------------------------------------------------------------------------

let bucketGarantido = false;
async function garantirBucket() {
  if (bucketGarantido) return;
  const { error } = await supabaseAdmin.storage.getBucket(BUCKET);
  if (error) {
    const { error: criar } = await supabaseAdmin.storage.createBucket(BUCKET, { public: false });
    if (criar && !/already exists/i.test(criar.message)) throw criar;
  }
  bucketGarantido = true;
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
};

function tipoVeiculoDoCrlv(tipoDoc: string, especie?: string | null): string {
  if (tipoDoc === 'CRLV_CAVALO') return 'CAVALO';
  const e = (especie ?? '').toLowerCase();
  if (e.includes('sider')) return 'CARRETA_SIDER';
  return 'CARRETA_OUTRO';
}

export async function enviarDocumentos(
  motoristaId: string,
  input: EnviarDocumentosMotoristaInput,
  userId: string | null,
  ip: string | null,
): Promise<MotoristaDocumento[]> {
  // Tabela da migration 0014.
  const { error: probe } = await supabaseAdmin.from(TABELA).select('id').limit(1);
  if (probe && isSchemaAusente(probe)) throw erroMigration0014();
  await garantirBucket();

  const gravados: MotoristaDocumento[] = [];
  for (const arq of input.arquivos) {
    const bytes = Buffer.from(arq.base64, 'base64');
    if (bytes.length > 10 * 1024 * 1024)
      throw new DomainError('Arquivo grande demais', 413, `${arq.nome} passa de 10 MB.`);
    const path = `${motoristaId}/${input.tipo.toLowerCase()}/${randomUUID()}.${EXT[arq.mime] ?? 'bin'}`;
    const { error: up } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: arq.mime, upsert: false });
    if (up) throw new DomainError('Falha ao salvar o arquivo', 502, up.message);
    const { data, error } = await supabaseAdmin
      .from(TABELA)
      .insert({
        motorista_id: motoristaId,
        tipo: input.tipo,
        placa: input.placa ?? null,
        nome_arquivo: arq.nome,
        mime_type: arq.mime,
        tamanho_bytes: bytes.length,
        storage_path: path,
        ocr_dados: input.ocr_dados ?? null,
        created_by: userId,
      })
      .select('*')
      .single();
    if (error) throw new DomainError('Falha ao registrar o documento', 500, error.message);
    gravados.push(data as MotoristaDocumento);
  }

  // CRLV com placa: o veículo passa a existir/ficar atualizado com o que o documento diz.
  if (input.tipo.startsWith('CRLV') && input.placa) {
    const ocr = (input.ocr_dados ?? {}) as Partial<OcrCrlv>;
    const campos: Record<string, unknown> = {};
    if (ocr.marca) campos.marca = ocr.marca;
    if (ocr.modelo) campos.modelo = ocr.modelo;
    if (ocr.ano_fabricacao) campos.ano_fabricacao = ocr.ano_fabricacao;
    if (ocr.proprietario) campos.proprietario = ocr.proprietario;
    const { data: existente } = await supabaseAdmin
      .from('veiculos')
      .select('id, dados_extras')
      .eq('placa', input.placa)
      .is('deleted_at', null)
      .maybeSingle();
    const extras = {
      ...(((existente as { dados_extras?: Record<string, unknown> } | null)?.dados_extras) ?? {}),
      ...(ocr.renavam ? { RENAVAM: ocr.renavam } : {}),
      ...(ocr.chassi ? { Chassi: ocr.chassi } : {}),
    };
    if (existente) {
      const patch = { ...campos, ...(Object.keys(extras).length ? { dados_extras: extras } : {}) };
      if (Object.keys(patch).length > 0)
        await supabaseAdmin.from('veiculos').update(patch).eq('id', (existente as { id: string }).id);
    } else {
      const { error } = await supabaseAdmin.from('veiculos').insert({
        placa: input.placa,
        tipo: tipoVeiculoDoCrlv(input.tipo, ocr.especie_tipo),
        frota_propria: true,
        ativo: true,
        ...campos,
        ...(Object.keys(extras).length ? { dados_extras: extras } : {}),
      });
      if (error) logger.warn({ error }, 'Não foi possível cadastrar o veículo do CRLV');
    }
  }

  await writeAuditLog({
    userId,
    action: 'CREATE',
    entity: TABELA,
    entityId: motoristaId,
    changes: { tipo: input.tipo, placa: input.placa ?? null, arquivos: gravados.map((g) => g.nome_arquivo) },
    ip,
  });
  return gravados;
}

export async function listarDocumentos(motoristaId: string): Promise<MotoristaDocumento[]> {
  const { data, error } = await supabaseAdmin
    .from(TABELA)
    .select('*')
    .eq('motorista_id', motoristaId)
    .order('created_at', { ascending: false });
  if (error) {
    if (isSchemaAusente(error)) return [];
    throw new DomainError('Falha ao listar documentos', 500, error.message);
  }
  const docs = (data ?? []) as MotoristaDocumento[];
  return Promise.all(
    docs.map(async (d) => {
      const { data: s } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(d.storage_path, 3600);
      return { ...d, url: s?.signedUrl ?? null };
    }),
  );
}

export async function excluirDocumento(
  motoristaId: string,
  docId: string,
  userId: string | null,
  ip: string | null,
): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from(TABELA)
    .select('*')
    .eq('id', docId)
    .eq('motorista_id', motoristaId)
    .maybeSingle();
  if (error || !data) throw new DomainError('Documento não encontrado', 404);
  const doc = data as MotoristaDocumento;
  await supabaseAdmin.storage.from(BUCKET).remove([doc.storage_path]);
  await supabaseAdmin.from(TABELA).delete().eq('id', docId);
  await writeAuditLog({ userId, action: 'DELETE', entity: TABELA, entityId: docId, changes: { before: doc }, ip });
}
