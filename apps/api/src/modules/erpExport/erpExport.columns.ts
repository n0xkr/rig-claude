/** Colunas (e ordem) da exportação CSV financeira — mantidas estáveis para não quebrar planilhas/importadores já configurados. */
export const ERP_FINANCEIRO_COLUNAS = [
  'frete_id',
  'viagem_id',
  'numero_crt',
  'numero_fatura',
  'status_fechamento',
  'valor_contratado',
  'total_adiantamentos',
  'total_descontos',
  'total_multas',
  'total_pago_confirmado',
  'saldo',
  'data_referencia',
];

/** Colunas (e ordem) da exportação CSV de estoque — mantidas estáveis pelo mesmo motivo acima. */
export const ERP_ESTOQUE_COLUNAS = [
  'movimentacao_id',
  'produto_id',
  'sku',
  'depositante_id',
  'tipo_movimentacao',
  'quantidade',
  'referencia_documento',
  'data_movimentacao',
];
