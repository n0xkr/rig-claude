import type { TipoMovimentacaoEstoque } from '@rigabras/shared';

/**
 * Regras de negócio puras do ledger de estoque do Armazém Geral (Módulo 5,
 * critério #1 — regras de negócio isoladas do HTTP/banco, critério #10 —
 * testáveis isoladamente). O ledger (`movimentacoes_estoque`) é a fonte da
 * verdade (ver nota de modelagem na migration 0006); a tabela `estoque` é um
 * saldo materializado, sempre calculado a partir destas funções — nunca
 * editado "à mão" fora deste módulo.
 */

/** Delta a aplicar no saldo do endereço de ORIGEM e no de DESTINO de uma movimentação, em função do tipo. */
export interface DeltaSaldo {
  origemDelta: number;
  destinoDelta: number;
}

/**
 * Tipos de movimentação que representam ENTRADA pura de mercadoria no
 * armazém (sem endereço de origem — a mercadoria "aparece" no endereço de
 * destino).
 */
export const TIPOS_ENTRADA_PURA: TipoMovimentacaoEstoque[] = ['RECEBIMENTO', 'ENDERECAMENTO'];

/**
 * Tipos de movimentação que representam SAÍDA pura de mercadoria do armazém
 * (sem endereço de destino — a mercadoria sai do endereço de origem).
 */
export const TIPOS_SAIDA_PURA: TipoMovimentacaoEstoque[] = [
  'SEPARACAO',
  'EXPEDICAO',
  'CROSS_DOCKING',
  'AVARIA',
];

/**
 * Calcula o delta de saldo (origem/destino) para uma movimentação, dado seu
 * tipo e a quantidade (sempre positiva no ledger, por constraint de banco).
 * REEMBALAGEM/ETIQUETAGEM não alteram saldo por padrão (são eventos de
 * rastreabilidade sobre um produto já endereçado), a menos que informem um
 * destino (reembalagem que também move o produto). AJUSTE_INVENTARIO só
 * altera o lado informado (origem = redução, destino = aumento) — nunca os
 * dois ao mesmo tempo, refletindo a direção da divergência apurada na
 * contagem (ver `calcularAjustesInventario`).
 */
export function calcularDeltaSaldo(
  tipo: TipoMovimentacaoEstoque,
  quantidade: number,
  temEnderecoOrigem: boolean,
  temEnderecoDestino: boolean,
): DeltaSaldo {
  if (quantidade <= 0) {
    throw new Error('Quantidade da movimentação deve ser positiva');
  }

  if (tipo === 'TRANSFERENCIA' || tipo === 'AJUSTE_INVENTARIO') {
    return {
      origemDelta: temEnderecoOrigem ? -quantidade : 0,
      destinoDelta: temEnderecoDestino ? quantidade : 0,
    };
  }

  if (TIPOS_ENTRADA_PURA.includes(tipo)) {
    return { origemDelta: 0, destinoDelta: temEnderecoDestino ? quantidade : 0 };
  }

  if (TIPOS_SAIDA_PURA.includes(tipo)) {
    return { origemDelta: temEnderecoOrigem ? -quantidade : 0, destinoDelta: 0 };
  }

  // REEMBALAGEM / ETIQUETAGEM: eventos de rastreabilidade, opcionalmente com
  // movimento de endereço (mesma regra de TRANSFERENCIA quando ambos os
  // lados estão presentes).
  return {
    origemDelta: temEnderecoOrigem ? -quantidade : 0,
    destinoDelta: temEnderecoDestino ? quantidade : 0,
  };
}

/** Ocupação do armazém (critério #6 — KPIs): % de endereços não-LIVRE. */
export function calcularPercentualOcupacao(
  totalEnderecos: number,
  enderecosOcupados: number,
): number {
  if (totalEnderecos <= 0) return 0;
  return round2((enderecosOcupados / totalEnderecos) * 100);
}

/**
 * Giro de estoque (critério #6 — KPIs): quantidade expedida no período
 * dividida pelo saldo médio no período. `null` quando não há saldo médio
 * (evita divisão por zero / indicador enganoso).
 */
export function calcularGiroEstoque(
  quantidadeExpedidaPeriodo: number,
  saldoMedioPeriodo: number,
): number | null {
  if (saldoMedioPeriodo <= 0) return null;
  return round2(quantidadeExpedidaPeriodo / saldoMedioPeriodo);
}

export interface ItemReconciliacao {
  produto_id: string;
  endereco_id: string;
  quantidade_sistema: number;
  quantidade_contada: number;
}

export interface AjusteCalculado extends ItemReconciliacao {
  divergencia: number; // contada - sistema (pode ser negativa)
  direcao: 'AUMENTO' | 'REDUCAO' | 'SEM_AJUSTE';
}

/**
 * Reconcilia os itens contados de um inventário contra o saldo do ledger
 * (critério "Controle de Inventário" — reconciliação cria lançamentos de
 * ajuste no ledger para discrepâncias, nunca edita o saldo em silêncio).
 * Itens sem divergência (contada === sistema) não geram ajuste.
 */
export function calcularAjustesInventario(itens: ItemReconciliacao[]): AjusteCalculado[] {
  return itens.map((item) => {
    const divergencia = round2(item.quantidade_contada - item.quantidade_sistema);
    const direcao: AjusteCalculado['direcao'] =
      divergencia > 0 ? 'AUMENTO' : divergencia < 0 ? 'REDUCAO' : 'SEM_AJUSTE';
    return { ...item, divergencia, direcao };
  });
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
