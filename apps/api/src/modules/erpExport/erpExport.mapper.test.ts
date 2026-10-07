import { describe, expect, it } from 'vitest';
import type { Frete, SaldoFrete } from '@rigabras/shared';
import { estaNoPeriodo, mapFreteParaErp, mapMovimentacaoParaErp } from './erpExport.mapper.js';

const FRETE_BASE: Frete = {
  id: 'f1',
  viagem_id: 'v1',
  numero_fatura: 'FAT-001',
  valor_contratado: 1000,
  retorno_vazio: true,
  status_fechamento: 'PAGO',
  created_at: '2026-03-15T10:00:00.000Z',
};

const SALDO_BASE: SaldoFrete = {
  frete_id: 'f1',
  valor_contratado: 1000,
  total_adiantamentos: 100,
  total_descontos: 50,
  total_multas: 0,
  total_pago_confirmado: 850,
  saldo: 0,
};

describe('Módulo 7 — erpExport.mapper (Integração ERP)', () => {
  describe('mapFreteParaErp', () => {
    it('molda um frete + saldo no formato de exportação financeira do ERP', () => {
      const registro = mapFreteParaErp(FRETE_BASE, SALDO_BASE, 'CRT-123');
      expect(registro).toEqual({
        frete_id: 'f1',
        viagem_id: 'v1',
        numero_crt: 'CRT-123',
        numero_fatura: 'FAT-001',
        status_fechamento: 'PAGO',
        valor_contratado: 1000,
        total_adiantamentos: 100,
        total_descontos: 50,
        total_multas: 0,
        total_pago_confirmado: 850,
        saldo: 0,
        data_referencia: '2026-03-15T10:00:00.000Z',
      });
    });

    it('usa numero_crt nulo quando a viagem não tem CRT cadastrado', () => {
      const registro = mapFreteParaErp(FRETE_BASE, SALDO_BASE, null);
      expect(registro.numero_crt).toBeNull();
    });

    it('nunca falha quando numero_fatura é ausente (fica null, nunca undefined)', () => {
      const registro = mapFreteParaErp({ ...FRETE_BASE, numero_fatura: null }, SALDO_BASE, null);
      expect(registro.numero_fatura).toBeNull();
    });
  });

  describe('mapMovimentacaoParaErp', () => {
    it('molda uma movimentação de estoque com produto joinado no formato de exportação do ERP', () => {
      const registro = mapMovimentacaoParaErp({
        id: 'm1',
        produto_id: 'p1',
        tipo_movimentacao: 'EXPEDICAO',
        quantidade: 42,
        referencia_documento: 'DOC-9',
        created_at: '2026-03-20T08:30:00.000Z',
        produtos_armazenados: { sku: 'SKU-01', depositante_id: 'd1' },
      });
      expect(registro).toEqual({
        movimentacao_id: 'm1',
        produto_id: 'p1',
        sku: 'SKU-01',
        depositante_id: 'd1',
        tipo_movimentacao: 'EXPEDICAO',
        quantidade: 42,
        referencia_documento: 'DOC-9',
        data_movimentacao: '2026-03-20T08:30:00.000Z',
      });
    });

    it('nunca falha quando o join do produto não retorna nada: sku/depositante ficam null', () => {
      const registro = mapMovimentacaoParaErp({
        id: 'm2',
        produto_id: 'p2',
        tipo_movimentacao: 'AVARIA',
        quantidade: 3,
        referencia_documento: null,
        created_at: '2026-03-21T09:00:00.000Z',
        produtos_armazenados: null,
      });
      expect(registro.sku).toBeNull();
      expect(registro.depositante_id).toBeNull();
    });
  });

  describe('estaNoPeriodo', () => {
    it('inclui os extremos do período (inicio e fim inclusive)', () => {
      expect(estaNoPeriodo('2026-03-01T00:00:00.000Z', '2026-03-01', '2026-03-31')).toBe(true);
      expect(estaNoPeriodo('2026-03-31T23:59:59.999Z', '2026-03-01', '2026-03-31')).toBe(true);
    });

    it('exclui datas fora do período', () => {
      expect(estaNoPeriodo('2026-02-28T23:59:59.999Z', '2026-03-01', '2026-03-31')).toBe(false);
      expect(estaNoPeriodo('2026-04-01T00:00:00.000Z', '2026-03-01', '2026-03-31')).toBe(false);
    });
  });
});
