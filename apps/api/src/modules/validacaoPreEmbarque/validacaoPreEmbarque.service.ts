import type {
  AchadoValidacao,
  ResultadoValidacaoPreEmbarque,
  ValidarPreEmbarqueInput,
} from '@rigabras/shared';
import { TipoDocumentoEmbarqueSchema } from '@rigabras/shared';
import { ValidacaoPreEmbarqueRepository } from './validacaoPreEmbarque.repository.js';
import { ViagensRepository } from '../viagens/viagens.repository.js';
import { VeiculosRepository } from '../veiculos/veiculos.repository.js';
import { MotoristasRepository } from '../motoristas/motoristas.repository.js';
import { NotFoundError } from '../../lib/errors.js';

/**
 * Serviço de validação cruzada pré-embarque (Módulo 2, critério #3):
 * cruza CRT, Fatura, MIC/DTA, dados do veículo e dados da viagem, retornando
 * uma lista estruturada de achados (findings) — não apenas um booleano de
 * aprovado/reprovado.
 */
export class ValidacaoPreEmbarqueService {
  constructor(
    private readonly repo: ValidacaoPreEmbarqueRepository = new ValidacaoPreEmbarqueRepository(),
    private readonly viagensRepo: ViagensRepository = new ViagensRepository(),
    private readonly veiculosRepo: VeiculosRepository = new VeiculosRepository(),
    private readonly motoristasRepo: MotoristasRepository = new MotoristasRepository(),
  ) {}

  async validar(
    viagemId: string,
    input: ValidarPreEmbarqueInput,
  ): Promise<ResultadoValidacaoPreEmbarque> {
    const viagem = await this.viagensRepo.findById(viagemId);
    if (!viagem) throw new NotFoundError('viagem', viagemId);

    const documentos = await this.repo.listDocumentosByViagem(viagemId);
    const achados: AchadoValidacao[] = [];

    const tiposObrigatorios = TipoDocumentoEmbarqueSchema.options.filter(
      (t) => t === 'CRT' || t === 'MIC_DTA' || t === 'FATURA',
    );
    const tiposPresentes = new Set(documentos.map((d) => d.tipo_documento));
    const documentosFaltantes = tiposObrigatorios.filter((t) => !tiposPresentes.has(t));
    for (const faltante of documentosFaltantes) {
      achados.push({
        campo: 'documentos',
        severidade: 'BLOQUEANTE',
        mensagem: `Documento obrigatório ausente: ${faltante}`,
        valorEsperado: faltante,
        valorEncontrado: null,
      });
    }

    // CRT: número declarado na viagem deve bater com o documento CRT anexado.
    const crtDoc = documentos.find((d) => d.tipo_documento === 'CRT');
    if (crtDoc && viagem.numero_crt && crtDoc.numero_documento !== viagem.numero_crt) {
      achados.push({
        campo: 'numero_crt',
        severidade: 'BLOQUEANTE',
        mensagem: 'Número do CRT da viagem diverge do documento CRT anexado',
        valorEsperado: viagem.numero_crt,
        valorEncontrado: crtDoc.numero_documento ?? null,
      });
    }
    if (crtDoc && !crtDoc.validado) {
      achados.push({
        campo: 'numero_crt',
        severidade: 'AVISO',
        mensagem: 'Documento CRT ainda não foi validado por um operador',
      });
    }

    // MIC/DTA: número declarado na viagem deve bater com o documento anexado.
    const micDtaDoc = documentos.find((d) => d.tipo_documento === 'MIC_DTA');
    const micDtaEsperado = input.mic_dta_numero ?? viagem.numero_mic_dta;
    if (micDtaDoc && micDtaEsperado && micDtaDoc.numero_documento !== micDtaEsperado) {
      achados.push({
        campo: 'numero_mic_dta',
        severidade: 'BLOQUEANTE',
        mensagem: 'Número do MIC/DTA diverge do documento anexado',
        valorEsperado: micDtaEsperado,
        valorEncontrado: micDtaDoc.numero_documento ?? null,
      });
    }

    // Fatura: valor informado deve ser compatível com o valor do frete da viagem.
    const faturaDoc = documentos.find((d) => d.tipo_documento === 'FATURA');
    if (input.fatura_valor != null && viagem.valor_frete != null) {
      const diffPercent =
        Math.abs(input.fatura_valor - viagem.valor_frete) / (viagem.valor_frete || 1);
      if (diffPercent > 0.1) {
        achados.push({
          campo: 'fatura_valor',
          severidade: 'AVISO',
          mensagem: 'Valor da fatura diverge em mais de 10% do valor do frete da viagem',
          valorEsperado: String(viagem.valor_frete),
          valorEncontrado: String(input.fatura_valor),
        });
      }
    }
    if (faturaDoc && input.fatura_numero && faturaDoc.numero_documento !== input.fatura_numero) {
      achados.push({
        campo: 'fatura_numero',
        severidade: 'AVISO',
        mensagem: 'Número da fatura informado diverge do documento anexado',
        valorEsperado: faturaDoc.numero_documento ?? null,
        valorEncontrado: input.fatura_numero,
      });
    }

    // Veículo: placa declarada deve bater com a placa do cavalo da viagem, e o
    // veículo vinculado precisa existir e estar ativo.
    const placaEsperada = input.placa_declarada ?? viagem.placa_cavalo;
    if (placaEsperada !== viagem.placa_cavalo) {
      achados.push({
        campo: 'placa_cavalo',
        severidade: 'BLOQUEANTE',
        mensagem: 'Placa declarada diverge da placa do cavalo cadastrada na viagem',
        valorEsperado: viagem.placa_cavalo,
        valorEncontrado: placaEsperada,
      });
    }
    // `veiculo_id` é opcional na viagem, mas `placa_cavalo` é obrigatória e é FK
    // para `veiculos.placa` — então o veículo sempre pode ser resolvido pela placa.
    const veiculo = viagem.veiculo_id
      ? await this.veiculosRepo.findById(viagem.veiculo_id)
      : await this.veiculosRepo.findByPlaca(viagem.placa_cavalo);
    if (!veiculo) {
      achados.push({
        campo: 'veiculo_id',
        severidade: 'BLOQUEANTE',
        mensagem: 'Veículo da viagem não foi encontrado (ou foi removido)',
        valorEncontrado: viagem.placa_cavalo,
      });
    } else if (!veiculo.ativo) {
      achados.push({
        campo: 'veiculo_id',
        severidade: 'BLOQUEANTE',
        mensagem: 'Veículo vinculado à viagem está inativo',
      });
    } else if (veiculo.placa !== viagem.placa_cavalo) {
      achados.push({
        campo: 'veiculo_id',
        severidade: 'AVISO',
        mensagem: 'Placa do veículo cadastrado diverge da placa informada na viagem',
        valorEsperado: viagem.placa_cavalo,
        valorEncontrado: veiculo.placa,
      });
    }

    // `cnh_validade` é `date` (YYYY-MM-DD): compara como string, sem fuso horário.
    const hoje = new Date().toISOString().slice(0, 10);

    // Motorista: precisa existir, estar ativo e com CNH válida.
    if (viagem.motorista_id) {
      const motorista = await this.motoristasRepo.findById(viagem.motorista_id);
      if (!motorista) {
        achados.push({
          campo: 'motorista_id',
          severidade: 'BLOQUEANTE',
          mensagem: 'Motorista vinculado à viagem não foi encontrado',
        });
      } else {
        if (!motorista.ativo) {
          achados.push({
            campo: 'motorista_id',
            severidade: 'BLOQUEANTE',
            mensagem: 'Motorista vinculado à viagem está inativo',
          });
        }
        if (motorista.cnh_validade && motorista.cnh_validade < hoje) {
          achados.push({
            campo: 'motorista_id',
            severidade: 'BLOQUEANTE',
            mensagem: 'CNH do motorista vinculado está vencida',
            valorEsperado: 'CNH válida',
            valorEncontrado: motorista.cnh_validade,
          });
        }
      }
    } else {
      achados.push({
        campo: 'motorista_id',
        severidade: 'BLOQUEANTE',
        mensagem: 'Viagem sem motorista vinculado',
      });
    }

    const aprovado = achados.every((a) => a.severidade !== 'BLOQUEANTE');

    return {
      viagem_id: viagemId,
      aprovado,
      gerado_em: new Date().toISOString(),
      achados,
      documentos_verificados: documentos.map((d) => d.tipo_documento),
      documentos_faltantes: documentosFaltantes,
    };
  }
}
