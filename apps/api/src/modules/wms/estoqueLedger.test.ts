import { describe, expect, it } from 'vitest';
import {
  calcularAjustesInventario,
  calcularDeltaSaldo,
  calcularGiroEstoque,
  calcularPercentualOcupacao,
} from './estoqueLedger.js';

describe('Módulo 5 — estoqueLedger (WMS Armazém Geral)', () => {
  describe('calcularDeltaSaldo', () => {
    it('RECEBIMENTO: soma apenas no endereço de destino, nunca subtrai de origem', () => {
      const delta = calcularDeltaSaldo('RECEBIMENTO', 100, false, true);
      expect(delta).toEqual({ origemDelta: 0, destinoDelta: 100 });
    });

    it('EXPEDICAO: subtrai apenas do endereço de origem, nunca soma em destino', () => {
      const delta = calcularDeltaSaldo('EXPEDICAO', 40, true, false);
      expect(delta).toEqual({ origemDelta: -40, destinoDelta: 0 });
    });

    it('AVARIA: sempre reduz o saldo do endereço onde foi constatada (comporta-se como saída)', () => {
      const delta = calcularDeltaSaldo('AVARIA', 5, true, false);
      expect(delta).toEqual({ origemDelta: -5, destinoDelta: 0 });
    });

    it('TRANSFERENCIA: move o saldo integralmente de origem para destino (soma zero)', () => {
      const delta = calcularDeltaSaldo('TRANSFERENCIA', 30, true, true);
      expect(delta.origemDelta + delta.destinoDelta).toBe(0);
      expect(delta).toEqual({ origemDelta: -30, destinoDelta: 30 });
    });

    it('AJUSTE_INVENTARIO de aumento: só soma no destino (o endereço contado a maior), nunca subtrai de outro lugar', () => {
      const delta = calcularDeltaSaldo('AJUSTE_INVENTARIO', 12, false, true);
      expect(delta).toEqual({ origemDelta: 0, destinoDelta: 12 });
    });

    it('AJUSTE_INVENTARIO de redução: só subtrai da origem (o endereço contado a menor)', () => {
      const delta = calcularDeltaSaldo('AJUSTE_INVENTARIO', 8, true, false);
      expect(delta).toEqual({ origemDelta: -8, destinoDelta: 0 });
    });

    it('rejeita quantidade não positiva (o ledger nunca aceita movimentação com quantidade <= 0)', () => {
      expect(() => calcularDeltaSaldo('RECEBIMENTO', 0, false, true)).toThrow();
      expect(() => calcularDeltaSaldo('RECEBIMENTO', -1, false, true)).toThrow();
    });
  });

  describe('calcularPercentualOcupacao', () => {
    it('calcula o percentual de endereços ocupados sobre o total', () => {
      expect(calcularPercentualOcupacao(200, 150)).toBe(75);
    });

    it('retorna 0 (nunca divide por zero) quando não há endereços cadastrados', () => {
      expect(calcularPercentualOcupacao(0, 0)).toBe(0);
    });
  });

  describe('calcularGiroEstoque', () => {
    it('calcula o giro como expedido/saldo médio no período', () => {
      expect(calcularGiroEstoque(500, 250)).toBe(2);
    });

    it('retorna null (nunca divide por zero) quando o saldo médio do período é zero', () => {
      expect(calcularGiroEstoque(500, 0)).toBeNull();
    });
  });

  describe('calcularAjustesInventario', () => {
    it('classifica cada item contado como AUMENTO, REDUCAO ou SEM_AJUSTE, sem gerar ajuste para itens conferidos', () => {
      const itens = [
        { produto_id: 'p1', endereco_id: 'e1', quantidade_sistema: 100, quantidade_contada: 100 },
        { produto_id: 'p2', endereco_id: 'e2', quantidade_sistema: 100, quantidade_contada: 90 },
        { produto_id: 'p3', endereco_id: 'e3', quantidade_sistema: 50, quantidade_contada: 55 },
      ];

      const ajustes = calcularAjustesInventario(itens);

      expect(ajustes[0]).toMatchObject({ divergencia: 0, direcao: 'SEM_AJUSTE' });
      expect(ajustes[1]).toMatchObject({ divergencia: -10, direcao: 'REDUCAO' });
      expect(ajustes[2]).toMatchObject({ divergencia: 5, direcao: 'AUMENTO' });
    });

    it('nunca edita o saldo em silêncio: cada divergência vira um registro explícito de ajuste calculado', () => {
      const ajustes = calcularAjustesInventario([
        { produto_id: 'p1', endereco_id: 'e1', quantidade_sistema: 10, quantidade_contada: 7 },
      ]);
      expect(ajustes).toHaveLength(1);
      expect(ajustes[0]!.direcao).not.toBe('SEM_AJUSTE');
    });
  });
});
