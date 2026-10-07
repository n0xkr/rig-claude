import { z } from 'zod';

export const UserRoleSchema = z.enum(['SUPERADMIN', 'ADMIN', 'OPERADOR', 'VISITANTE', 'PORTARIA']);
export type UserRole = z.infer<typeof UserRoleSchema>;

/**
 * Ciclo de vida operacional da viagem — fluxo real da operação Rigabras
 * (Brasil ↔ Mercosul via Uruguaiana/Paso de los Libres):
 *
 * Programada/agendada -> em trânsito para o cliente -> no cliente aguardando
 * carregamento -> carregado aguardando documentos -> em trânsito para a
 * fronteira -> na fronteira (aguardando descarga OU só aguardando o pedido de
 * cruze — nem todo veículo é descarregado na fronteira) -> programado para
 * carregar -> carregado -> aduanas Multilog / Cotecar (entrada e saída) ->
 * aduana de destino (chegada e saída) -> chegada no cliente -> vazio no
 * cliente -> saída do cliente -> retornando vazio -> fim de viagem.
 *
 * Os valores antigos (AGUARDANDO_COLETA, EM_COLETA, EM_DOCUMENTACAO, ...)
 * continuam no enum só para ler linhas antigas do histórico: não fazem parte
 * do fluxo e a migration 0014 converte as viagens que ainda estavam neles.
 */
export const StatusViagemSchema = z.enum([
  'PROGRAMADA',
  'EM_TRANSITO_CLIENTE',
  'NO_CLIENTE_AGUARDANDO_CARREGAMENTO',
  'CARREGADO_AGUARDANDO_DOCUMENTOS',
  'EM_TRANSITO_FRONTEIRA',
  'NA_FRONTEIRA',
  'NA_FRONTEIRA_AGUARDANDO_CRUZE',
  'PROGRAMADO_CARREGAR',
  'CARREGADO',
  'ENTRADA_ADUANA_MULTILOG',
  'SAIDA_ADUANA_MULTILOG',
  'ENTRADA_ADUANA_COTECAR',
  'SAIDA_ADUANA_COTECAR',
  'CHEGADA_ADUANA_DESTINO',
  'SAIDA_ADUANA_DESTINO',
  'CHEGADA_CLIENTE',
  'VAZIO_NO_CLIENTE',
  'SAIDA_CLIENTE',
  'RETORNANDO_VAZIO',
  'ENCERRADA',
  'CANCELADA',
  // Legados (fluxo anterior) — só leitura.
  'AGUARDANDO_COLETA',
  'EM_COLETA',
  'EM_DOCUMENTACAO',
  'VEICULO_MOTORISTA_DEFINIDO',
  'EM_VALIDACAO_PRE_EMBARQUE',
  'EM_TRANSITO',
  'EM_MONITORAMENTO',
  'ENTREGUE',
]);
export type StatusViagem = z.infer<typeof StatusViagemSchema>;

/** Etapas do fluxo, na ordem em que acontecem (sem CANCELADA e sem os legados). */
export const FLUXO_STATUS_VIAGEM: StatusViagem[] = [
  'PROGRAMADA',
  'EM_TRANSITO_CLIENTE',
  'NO_CLIENTE_AGUARDANDO_CARREGAMENTO',
  'CARREGADO_AGUARDANDO_DOCUMENTOS',
  'EM_TRANSITO_FRONTEIRA',
  'NA_FRONTEIRA',
  'NA_FRONTEIRA_AGUARDANDO_CRUZE',
  'PROGRAMADO_CARREGAR',
  'CARREGADO',
  'ENTRADA_ADUANA_MULTILOG',
  'SAIDA_ADUANA_MULTILOG',
  'ENTRADA_ADUANA_COTECAR',
  'SAIDA_ADUANA_COTECAR',
  'CHEGADA_ADUANA_DESTINO',
  'SAIDA_ADUANA_DESTINO',
  'CHEGADA_CLIENTE',
  'VAZIO_NO_CLIENTE',
  'SAIDA_CLIENTE',
  'RETORNANDO_VAZIO',
  'ENCERRADA',
];

export const STATUS_VIAGEM_LEGADOS: StatusViagem[] = [
  'AGUARDANDO_COLETA',
  'EM_COLETA',
  'EM_DOCUMENTACAO',
  'VEICULO_MOTORISTA_DEFINIDO',
  'EM_VALIDACAO_PRE_EMBARQUE',
  'EM_TRANSITO',
  'EM_MONITORAMENTO',
  'ENTREGUE',
];

export const STATUS_VIAGEM_LABEL: Record<StatusViagem, string> = {
  PROGRAMADA: 'Programada / agendada',
  EM_TRANSITO_CLIENTE: 'Veículo em trânsito para o cliente',
  NO_CLIENTE_AGUARDANDO_CARREGAMENTO: 'Veículo no cliente aguardando carregamento',
  CARREGADO_AGUARDANDO_DOCUMENTOS: 'Veículo carregado aguardando documentos',
  EM_TRANSITO_FRONTEIRA: 'Carregado em trânsito para a fronteira',
  NA_FRONTEIRA: 'Na fronteira aguardando descarga',
  NA_FRONTEIRA_AGUARDANDO_CRUZE: 'Na fronteira aguardando pedido de cruze',
  PROGRAMADO_CARREGAR: 'Veículo programado para carregar',
  CARREGADO: 'Veículo carregado',
  ENTRADA_ADUANA_MULTILOG: 'Entrada aduana Multilog',
  SAIDA_ADUANA_MULTILOG: 'Saída aduana Multilog',
  ENTRADA_ADUANA_COTECAR: 'Entrada aduana Cotecar',
  SAIDA_ADUANA_COTECAR: 'Saída aduana Cotecar',
  CHEGADA_ADUANA_DESTINO: 'Chegada aduana de destino',
  SAIDA_ADUANA_DESTINO: 'Saída aduana de destino',
  CHEGADA_CLIENTE: 'Chegada no cliente',
  VAZIO_NO_CLIENTE: 'Vazio no cliente',
  SAIDA_CLIENTE: 'Saída do cliente',
  RETORNANDO_VAZIO: 'Retornando vazio',
  ENCERRADA: 'Fim de viagem',
  CANCELADA: 'Cancelada',
  AGUARDANDO_COLETA: 'Aguardando coleta (antigo)',
  EM_COLETA: 'Em coleta (antigo)',
  EM_DOCUMENTACAO: 'Em documentação (antigo)',
  VEICULO_MOTORISTA_DEFINIDO: 'Veículo/motorista definido (antigo)',
  EM_VALIDACAO_PRE_EMBARQUE: 'Em validação pré-embarque (antigo)',
  EM_TRANSITO: 'Em trânsito (antigo)',
  EM_MONITORAMENTO: 'Em monitoramento (antigo)',
  ENTREGUE: 'Entregue (antigo)',
};

/** Status antigo -> etapa equivalente do fluxo atual (usado pela migration 0014 e pela importação). */
export const STATUS_VIAGEM_LEGADO_PARA_ATUAL: Partial<Record<StatusViagem, StatusViagem>> = {
  AGUARDANDO_COLETA: 'EM_TRANSITO_CLIENTE',
  EM_COLETA: 'NO_CLIENTE_AGUARDANDO_CARREGAMENTO',
  EM_DOCUMENTACAO: 'CARREGADO_AGUARDANDO_DOCUMENTOS',
  VEICULO_MOTORISTA_DEFINIDO: 'CARREGADO_AGUARDANDO_DOCUMENTOS',
  EM_VALIDACAO_PRE_EMBARQUE: 'CARREGADO_AGUARDANDO_DOCUMENTOS',
  EM_TRANSITO: 'EM_TRANSITO_FRONTEIRA',
  EM_MONITORAMENTO: 'SAIDA_ADUANA_DESTINO',
  ENTREGUE: 'VAZIO_NO_CLIENTE',
};

/**
 * Transições da máquina de estados. A operação real pula etapas (nem todo
 * veículo passa por Multilog e Cotecar, nem todo é descarregado na fronteira),
 * então a partir de uma etapa é possível ir para QUALQUER etapa posterior,
 * voltar uma etapa (correção de lançamento) ou cancelar. Status antigos
 * entram no fluxo em qualquer etapa. Administradores podem forçar qualquer
 * status (ver ViagensService.changeStatus).
 */
export const TRANSICOES_STATUS_VIAGEM: Record<StatusViagem, StatusViagem[]> = (() => {
  const t = {} as Record<StatusViagem, StatusViagem[]>;
  for (const s of StatusViagemSchema.options) t[s] = [];
  FLUXO_STATUS_VIAGEM.forEach((s, i) => {
    if (s === 'ENCERRADA') return;
    const anterior = i > 0 ? [FLUXO_STATUS_VIAGEM[i - 1]!] : [];
    t[s] = [...FLUXO_STATUS_VIAGEM.slice(i + 1), ...anterior, 'CANCELADA'];
  });
  t.ENCERRADA = ['RETORNANDO_VAZIO'];
  for (const s of STATUS_VIAGEM_LEGADOS) t[s] = [...FLUXO_STATUS_VIAGEM.slice(1), 'CANCELADA'];
  return t;
})();

/** Viagem já teve a carga entregue (base para abrir o fechamento do frete). */
export const STATUS_VIAGEM_CARGA_ENTREGUE: StatusViagem[] = [
  'VAZIO_NO_CLIENTE',
  'SAIDA_CLIENTE',
  'RETORNANDO_VAZIO',
  'ENCERRADA',
  'ENTREGUE',
];

/** Viagem terminada (não ocupa mais veículo nem motorista). */
export const STATUS_VIAGEM_TERMINAIS: StatusViagem[] = ['ENCERRADA', 'CANCELADA', 'ENTREGUE'];

/** Veículo parado na fronteira/aduanas (destacado no painel e no mapa 3D). */
export const STATUS_VIAGEM_EM_FRONTEIRA: StatusViagem[] = [
  'NA_FRONTEIRA',
  'NA_FRONTEIRA_AGUARDANDO_CRUZE',
  'PROGRAMADO_CARREGAR',
  'CARREGADO',
  'ENTRADA_ADUANA_MULTILOG',
  'SAIDA_ADUANA_MULTILOG',
  'ENTRADA_ADUANA_COTECAR',
  'SAIDA_ADUANA_COTECAR',
];

/** Viagem com o veículo rodando/operando (nem agendada, nem terminada). */
export const STATUS_VIAGEM_EM_ANDAMENTO: StatusViagem[] = FLUXO_STATUS_VIAGEM.filter(
  (s) => s !== 'PROGRAMADA' && s !== 'ENCERRADA',
);

const semAcento = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Deduz a etapa da viagem a partir de um texto livre de planilha
 * ("VEICULO NA MULTILOG AGUARD. LIBERAÇÃO", "20 Finalizado", "Em trânsito p/
 * fronteira"...). Devolve `null` quando o texto não indica nenhuma etapa com
 * segurança — nesse caso a importação pergunta à IA ou mantém o status atual.
 */
export function statusViagemDeTexto(texto: unknown): StatusViagem | null {
  if (texto === null || texto === undefined) return null;
  const bruto = String(texto).trim();
  if (bruto === '') return null;
  const direto = bruto.toUpperCase().replace(/[^A-Z_]/g, '');
  if ((StatusViagemSchema.options as string[]).includes(direto)) {
    const s = direto as StatusViagem;
    return STATUS_VIAGEM_LEGADO_PARA_ATUAL[s] ?? s;
  }
  const t = ` ${semAcento(bruto)} `;
  const tem = (...ps: string[]) => ps.some((p) => t.includes(p));
  const aguardando = tem(' aguard', ' esperando', ' aguarda ');
  const saiu = !aguardando && tem(' saida', ' saiu', ' liberad', ' liberou', ' despachad');

  if (tem(' cancelad')) return 'CANCELADA';
  if (tem(' fim de viagem', ' finalizad', ' encerrad', ' concluid')) return 'ENCERRADA';
  // Veículo de volta à base, vazio: a viagem acabou.
  if (tem(' patio rigabras', ' vazio no patio', ' retornou vazio', ' chegou vazio')) return 'ENCERRADA';
  // Retorno com carga (importação de volta a Uruguaiana): é uma viagem rumo à fronteira.
  if (tem(' ret carregado', ' retorno carregado', ' retornando carregado')) return 'EM_TRANSITO_FRONTEIRA';
  if (tem(' retornando', ' retorno vazio', ' ret vazio', ' voltando', ' regressando', ' transito ret '))
    return 'RETORNANDO_VAZIO';
  // Códigos curtos das planilhas de frota ("INDO CARREGADO", "AG.DESCARREGAR", "AG.CARREGAR").
  if (tem(' indo carregado', ' seguindo carregado')) return 'EM_TRANSITO_FRONTEIRA';
  if (tem(' indo vazio')) return 'EM_TRANSITO_CLIENTE';
  if (tem(' ag descarreg', ' aguardando descarreg', ' aguard descarreg', ' pra descarregar', ' para descarregar'))
    return 'CHEGADA_CLIENTE';
  if (tem(' ag carregar', ' aguardando carregar', ' aguard carregar')) return 'PROGRAMADO_CARREGAR';
  if (tem(' ag programac', ' aguardando programac')) return 'PROGRAMADA';
  if (tem(' vazio no cliente', ' descarregad', ' descarregou', ' descarga concluida', ' entregue', ' entregado'))
    return 'VAZIO_NO_CLIENTE';
  if (tem(' cliente') && saiu && !tem(' aduana')) return 'SAIDA_CLIENTE';
  if (tem(' multilog')) return saiu ? 'SAIDA_ADUANA_MULTILOG' : 'ENTRADA_ADUANA_MULTILOG';
  if (tem(' cotecar', ' libres', ' paso de los'))
    return saiu ? 'SAIDA_ADUANA_COTECAR' : 'ENTRADA_ADUANA_COTECAR';
  if (tem(' aduana destino', ' aduana de destino', ' aduana no destino', ' aduana final'))
    return saiu ? 'SAIDA_ADUANA_DESTINO' : 'CHEGADA_ADUANA_DESTINO';
  if (tem(' programado para carregar', ' programado p carregar', ' programado pra carregar'))
    return 'PROGRAMADO_CARREGAR';
  if (tem(' cruze', ' cruce', ' cruzar')) return 'NA_FRONTEIRA_AGUARDANDO_CRUZE';
  // Carga descarregada no armazém da Rigabras em Uruguaiana (transbordo na fronteira).
  if (tem(' armazem rigabras', ' transbordo')) return 'NA_FRONTEIRA';
  if (tem(' em aduana', ' na aduana')) return 'ENTRADA_ADUANA_MULTILOG';
  if (tem(' transito a uruguaiana', ' transito para uruguaiana', ' rumo a uruguaiana'))
    return 'EM_TRANSITO_FRONTEIRA';
  if (tem(' fronteira')) {
    if (tem(' transito', ' rumo', ' indo', ' a caminho', ' em viagem'))
      return 'EM_TRANSITO_FRONTEIRA';
    return 'NA_FRONTEIRA';
  }
  if (tem(' no cliente', ' chegada cliente', ' chegou no cliente', ' chegou ao cliente')) {
    if (tem(' descarreg', ' descarga', ' entrega')) return 'CHEGADA_CLIENTE';
    if (tem(' carreg')) return 'NO_CLIENTE_AGUARDANDO_CARREGAMENTO';
    return 'CHEGADA_CLIENTE';
  }
  if (tem(' aguardando documento', ' aguard doc', ' aguardando doc', ' aguardando crt'))
    return 'CARREGADO_AGUARDANDO_DOCUMENTOS';
  if (tem(' aguardando carregamento', ' aguard carreg', ' carregando', ' para carregar'))
    return 'NO_CLIENTE_AGUARDANDO_CARREGAMENTO';
  if (tem(' transito para o cliente', ' transito p cliente', ' indo para o cliente', ' indo carregar'))
    return 'EM_TRANSITO_CLIENTE';
  if (tem(' em viagem', ' em transito', ' em rota', ' rodando')) return 'EM_TRANSITO_FRONTEIRA';
  if (tem(' carregado', ' carregou')) return 'CARREGADO_AGUARDANDO_DOCUMENTOS';
  if (tem(' programad', ' agendad', ' aberta', ' planejad')) return 'PROGRAMADA';
  return null;
}

export const SeveridadeRiscoSchema = z.enum(['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']);
export type SeveridadeRisco = z.infer<typeof SeveridadeRiscoSchema>;

export const StatusEventoRiscoSchema = z.enum(['ABERTO', 'EM_ANALISE', 'MITIGADO', 'ENCERRADO']);
export type StatusEventoRisco = z.infer<typeof StatusEventoRiscoSchema>;

export const TipoApoliceSchema = z.enum(['RCTR_VI', 'RCTR_VI_C']);
export type TipoApolice = z.infer<typeof TipoApoliceSchema>;

export const TipoVeiculoSchema = z.enum([
  'CAVALO',
  'CARRETA_ABERTA',
  'CARRETA_SIDER',
  'CARRETA_OUTRO',
]);
export type TipoVeiculo = z.infer<typeof TipoVeiculoSchema>;

/** Estado operacional "vivo" do veículo (acompanhamento de frota). */
export const StatusOperacionalVeiculoSchema = z.enum([
  'DISPONIVEL',
  'EM_TRANSITO',
  'MANUTENCAO',
  'GARAGEM',
]);
export type StatusOperacionalVeiculo = z.infer<typeof StatusOperacionalVeiculoSchema>;

export const PAISES_HABILITADOS = ['AR', 'BO', 'CL', 'PY', 'UY', 'PE'] as const;
export const PaisHabilitadoSchema = z.enum(PAISES_HABILITADOS);
export type PaisHabilitado = z.infer<typeof PaisHabilitadoSchema>;

// ============================================================================
// Módulo 2 — TMS Operacional
// ============================================================================

/** Etapas do fluxo de travessia de fronteira (critério #2 do Módulo 2). */
export const EtapaFronteiraSchema = z.enum([
  'AGENDAMENTO',
  'CHEGADA',
  'GATE',
  'FISCALIZACAO',
  'DESEMBARACO',
  'SAIDA',
  'LIBERACAO',
]);
export type EtapaFronteira = z.infer<typeof EtapaFronteiraSchema>;

/** Ordem cronológica esperada das etapas de fronteira, usada para KPIs. */
export const ORDEM_ETAPAS_FRONTEIRA: EtapaFronteira[] = [
  'AGENDAMENTO',
  'CHEGADA',
  'GATE',
  'FISCALIZACAO',
  'DESEMBARACO',
  'SAIDA',
  'LIBERACAO',
];

export const TipoDocumentoEmbarqueSchema = z.enum(['CRT', 'MIC_DTA', 'FATURA', 'DU_E', 'DUIMP']);
export type TipoDocumentoEmbarque = z.infer<typeof TipoDocumentoEmbarqueSchema>;

/** Severidade de um achado (finding) da validação pré-embarque. */
export const SeveridadeAchadoValidacaoSchema = z.enum(['INFO', 'AVISO', 'BLOQUEANTE']);
export type SeveridadeAchadoValidacao = z.infer<typeof SeveridadeAchadoValidacaoSchema>;

// ============================================================================
// Módulo 3 — Controle Financeiro do Frete
// ============================================================================

/**
 * Máquina de estados explícita do fechamento da viagem (critério #1 do
 * Módulo 3): ABERTO -> EM_CONFERENCIA (conferência operacional) -> APROVADO
 * (aprovação financeira) -> PAGO (pagamento), com REJEITADO como caminho de
 * retrabalho de volta a EM_CONFERENCIA.
 */
export const StatusFechamentoFreteSchema = z.enum([
  'ABERTO',
  'EM_CONFERENCIA',
  'APROVADO',
  'REJEITADO',
  'PAGO',
]);
export type StatusFechamentoFrete = z.infer<typeof StatusFechamentoFreteSchema>;

/** Transições válidas da máquina de estados de fechamento do frete. */
export const TRANSICOES_STATUS_FECHAMENTO_FRETE: Record<
  StatusFechamentoFrete,
  StatusFechamentoFrete[]
> = {
  ABERTO: ['EM_CONFERENCIA'],
  EM_CONFERENCIA: ['APROVADO', 'REJEITADO'],
  APROVADO: ['PAGO', 'REJEITADO'],
  REJEITADO: ['EM_CONFERENCIA'],
  PAGO: [],
};

/**
 * Papéis autorizados a executar cada transição (critério #4 — RBAC). A
 * conferência operacional (ABERTO -> EM_CONFERENCIA, REJEITADO ->
 * EM_CONFERENCIA e o próprio EM_CONFERENCIA -> REJEITADO quando o operador
 * encontra um problema) pode ser feita por OPERADOR; a aprovação financeira
 * (-> APROVADO) e o pagamento (-> PAGO), assim como uma rejeição após
 * aprovação (APROVADO -> REJEITADO), ficam restritos a ADMIN/SUPERADMIN.
 */
export const PAPEIS_TRANSICAO_FECHAMENTO_FRETE: Record<
  StatusFechamentoFrete,
  Partial<Record<StatusFechamentoFrete, UserRole[]>>
> = {
  ABERTO: { EM_CONFERENCIA: ['SUPERADMIN', 'ADMIN', 'OPERADOR'] },
  EM_CONFERENCIA: {
    APROVADO: ['SUPERADMIN', 'ADMIN'],
    REJEITADO: ['SUPERADMIN', 'ADMIN', 'OPERADOR'],
  },
  APROVADO: {
    PAGO: ['SUPERADMIN', 'ADMIN'],
    REJEITADO: ['SUPERADMIN', 'ADMIN'],
  },
  REJEITADO: { EM_CONFERENCIA: ['SUPERADMIN', 'ADMIN', 'OPERADOR'] },
  PAGO: {},
};

/** Tipo de lançamento financeiro que reduz o saldo do frete a receber/pagar. */
export const TipoLancamentoFreteSchema = z.enum(['ADIANTAMENTO', 'DESCONTO', 'MULTA']);
export type TipoLancamentoFrete = z.infer<typeof TipoLancamentoFreteSchema>;

/** Status de um pagamento individual dentro do ledger de pagamentos do frete. */
export const StatusPagamentoFreteSchema = z.enum(['PENDENTE', 'CONFIRMADO', 'CANCELADO']);
export type StatusPagamentoFrete = z.infer<typeof StatusPagamentoFreteSchema>;

// ============================================================================
// Módulo 4 — Controle de Frota e Jornada (foco ADI 5322)
// ============================================================================

export const TipoManutencaoVeiculoSchema = z.enum([
  'PREVENTIVA',
  'CORRETIVA',
  'REVISAO',
  'TROCA_PNEUS',
  'OUTRO',
]);
export type TipoManutencaoVeiculo = z.infer<typeof TipoManutencaoVeiculoSchema>;

/**
 * Tipo de evento no log contínuo de jornada do motorista (critério "Controle
 * de Jornada" — ADI 5322). Cada linha em `registros_jornada` é um evento
 * pontual e imutável; o serviço de conformidade reconstrói as sessões de
 * jornada e os tempos de direção/espera/descanso a partir da sequência
 * ordenada desses eventos por motorista.
 */
export const TipoEventoJornadaSchema = z.enum([
  'INICIO_JORNADA',
  'INICIO_DIRECAO',
  'FIM_DIRECAO',
  'INICIO_ESPERA',
  'FIM_ESPERA',
  'INICIO_DESCANSO',
  'FIM_DESCANSO',
  'FIM_JORNADA',
]);
export type TipoEventoJornada = z.infer<typeof TipoEventoJornadaSchema>;

/**
 * Máquina de estados explícita (critério #1) do log de jornada: dado o
 * último evento em aberto de um motorista, apenas os tipos de evento listados
 * aqui podem ser lançados a seguir (ex: não é possível lançar `FIM_DIRECAO`
 * sem um `INICIO_DIRECAO` pendente; após `FIM_JORNADA`, o único evento válido
 * é um novo `INICIO_JORNADA` — o que, por construção, torna o intervalo entre
 * duas jornadas um período de descanso "puro", nunca interrompido por outro
 * tipo de evento).
 */
export const PROXIMO_EVENTO_JORNADA_VALIDO: Record<TipoEventoJornada, TipoEventoJornada[]> = {
  INICIO_JORNADA: ['INICIO_DIRECAO', 'INICIO_ESPERA', 'INICIO_DESCANSO', 'FIM_JORNADA'],
  INICIO_DIRECAO: ['FIM_DIRECAO'],
  FIM_DIRECAO: ['INICIO_DIRECAO', 'INICIO_ESPERA', 'INICIO_DESCANSO', 'FIM_JORNADA'],
  INICIO_ESPERA: ['FIM_ESPERA'],
  FIM_ESPERA: ['INICIO_DIRECAO', 'INICIO_ESPERA', 'INICIO_DESCANSO', 'FIM_JORNADA'],
  INICIO_DESCANSO: ['FIM_DESCANSO'],
  FIM_DESCANSO: ['INICIO_DIRECAO', 'INICIO_ESPERA', 'INICIO_DESCANSO', 'FIM_JORNADA'],
  FIM_JORNADA: ['INICIO_JORNADA'],
};

// ============================================================================
// Módulo 5 — WMS (Armazém Geral, Decreto 1.102/1903)
// ============================================================================

export const StatusEnderecoArmazemSchema = z.enum(['LIVRE', 'OCUPADO', 'BLOQUEADO']);
export type StatusEnderecoArmazem = z.infer<typeof StatusEnderecoArmazemSchema>;

/**
 * Tipo de evento no ledger imutável de estoque (critério "Inventário deve
 * ser derivado/reconciliado do ledger, nunca um campo mutável solto"). As
 * chaves são estáveis e nunca renomeadas: o futuro Módulo 6 (integração
 * TMS+WMS) referencia 'CROSS_DOCKING' e 'EXPEDICAO' para casar uma expedição
 * do armazém com uma viagem do TMS.
 */
export const TipoMovimentacaoEstoqueSchema = z.enum([
  'RECEBIMENTO',
  'ENDERECAMENTO',
  'SEPARACAO',
  'REEMBALAGEM',
  'ETIQUETAGEM',
  'TRANSFERENCIA',
  'CROSS_DOCKING',
  'EXPEDICAO',
  'AVARIA',
  'AJUSTE_INVENTARIO',
]);
export type TipoMovimentacaoEstoque = z.infer<typeof TipoMovimentacaoEstoqueSchema>;

/** Máquina de estados do recebimento/conferência (critério "Recebimento e Conferência"). */
export const StatusRecebimentoSchema = z.enum([
  'AGUARDANDO',
  'EM_CONFERENCIA',
  'CONFERIDO',
  'ENDERECADO',
  'DIVERGENTE',
]);
export type StatusRecebimento = z.infer<typeof StatusRecebimentoSchema>;

export const TRANSICOES_STATUS_RECEBIMENTO: Record<StatusRecebimento, StatusRecebimento[]> = {
  AGUARDANDO: ['EM_CONFERENCIA'],
  EM_CONFERENCIA: ['CONFERIDO', 'DIVERGENTE'],
  CONFERIDO: ['ENDERECADO'],
  DIVERGENTE: ['EM_CONFERENCIA'],
  ENDERECADO: [],
};

export const TipoExpedicaoSchema = z.enum(['NORMAL', 'CROSS_DOCKING']);
export type TipoExpedicao = z.infer<typeof TipoExpedicaoSchema>;

/**
 * Máquina de estados da expedição (critérios "Separação, Reembalagem,
 * Etiquetagem" e "Cross-docking / Consolidação / Expedição") — etapas
 * estruturadas e timestampadas, mesmo racional do fluxo de fronteira do
 * Módulo 2. Uma expedição CROSS_DOCKING pode pular direto de SOLICITADA para
 * PRONTA_EXPEDICAO (mercadoria roteada direto para expedição, sem
 * endereçamento pleno no armazém).
 */
export const StatusExpedicaoSchema = z.enum([
  'SOLICITADA',
  'EM_SEPARACAO',
  'SEPARADA',
  'EM_REEMBALAGEM',
  'PRONTA_EXPEDICAO',
  'EXPEDIDA',
  'CANCELADA',
]);
export type StatusExpedicao = z.infer<typeof StatusExpedicaoSchema>;

export const TRANSICOES_STATUS_EXPEDICAO: Record<StatusExpedicao, StatusExpedicao[]> = {
  SOLICITADA: ['EM_SEPARACAO', 'PRONTA_EXPEDICAO', 'CANCELADA'], // pula p/ PRONTA_EXPEDICAO em cross-docking
  EM_SEPARACAO: ['SEPARADA', 'CANCELADA'],
  SEPARADA: ['EM_REEMBALAGEM', 'PRONTA_EXPEDICAO', 'CANCELADA'],
  EM_REEMBALAGEM: ['PRONTA_EXPEDICAO', 'CANCELADA'],
  PRONTA_EXPEDICAO: ['EXPEDIDA', 'CANCELADA'],
  EXPEDIDA: [],
  CANCELADA: [],
};

export const SeveridadeAvariaSchema = z.enum(['LEVE', 'MODERADA', 'GRAVE', 'PERDA_TOTAL']);
export type SeveridadeAvaria = z.infer<typeof SeveridadeAvariaSchema>;

/** Máquina de estados do inventário/contagem (critério "Controle de Inventário"). */
export const StatusInventarioSchema = z.enum([
  'ABERTO',
  'EM_CONTAGEM',
  'RECONCILIADO',
  'ENCERRADO',
]);
export type StatusInventario = z.infer<typeof StatusInventarioSchema>;

export const TRANSICOES_STATUS_INVENTARIO: Record<StatusInventario, StatusInventario[]> = {
  ABERTO: ['EM_CONTAGEM'],
  EM_CONTAGEM: ['RECONCILIADO'],
  RECONCILIADO: ['ENCERRADO'],
  ENCERRADO: [],
};

// ---------------------------------------------------------------------------
// Redes de veículos (painel de controle das redes transportadas na frota)
// ---------------------------------------------------------------------------

/** Condição de uso da rede no momento do cadastro/avaliação. */
export const CondicaoUsoRedeSchema = z.enum(['NOVA', 'BOA', 'REGULAR', 'RUIM']);
export type CondicaoUsoRede = z.infer<typeof CondicaoUsoRedeSchema>;

/** Onde a rede está agora: no pátio (disponível) ou em trânsito com um veículo. */
export const StatusRedeSchema = z.enum(['DISPONIVEL', 'EM_TRANSITO']);
export type StatusRede = z.infer<typeof StatusRedeSchema>;

/** Tipo de movimentação da rede (retirada para uma viagem / devolução ao pátio). */
export const TipoMovimentacaoRedeSchema = z.enum(['RETIRADA', 'DEVOLUCAO']);
export type TipoMovimentacaoRede = z.infer<typeof TipoMovimentacaoRedeSchema>;

/**
 * Situação do checklist de conferência da rede (WMS > Checklist > Redes):
 * `CONCLUIDO` quando os três critérios (rede OK, lacre, catracas OK) estão
 * preenchidos — derivado no servidor a partir de `checklist_concluido_em`.
 */
export const StatusChecklistRedeSchema = z.enum(['PENDENTE', 'CONCLUIDO']);
export type StatusChecklistRede = z.infer<typeof StatusChecklistRedeSchema>;

// ============================================================================
// Módulo 6 — Integração TMS + WMS
// ============================================================================

/**
 * Origem de uma linha em `status_viagem_historico` (critério "integração
 * TMS+WMS"): `MANUAL` é toda transição de status lançada pelos Módulos 1-4
 * (comportamento padrão, retrocompatível com as linhas já existentes);
 * `WMS` marca uma NOTA informativa disparada automaticamente pelo Módulo 5
 * (ex: "expedição pronta para coleta", "recebimento criado a partir da
 * entrega") — uma nota WMS pode gravar `status_anterior = status_novo`
 * (não é uma transição de fato da máquina de estados da viagem).
 */
export const OrigemEventoViagemSchema = z.enum(['MANUAL', 'WMS', 'PORTARIA']);
export type OrigemEventoViagem = z.infer<typeof OrigemEventoViagemSchema>;

/**
 * Status de viagem em que é aceitável que o WMS sinalize a mercadoria como
 * "pronta para expedição/coleta" (critério "Expedição -> Viagem"): a viagem
 * ainda não partiu (nada além de PROGRAMADA/AGUARDANDO_COLETA/EM_COLETA) —
 * sinalizar isso quando a viagem já está em trânsito ou além não faz sentido
 * operacional e é rejeitado com 409 (Conflict).
 */
export const STATUS_VIAGEM_COMPATIVEIS_COM_WMS_PRONTA: StatusViagem[] = [
  'PROGRAMADA',
  'EM_TRANSITO_CLIENTE',
  'NO_CLIENTE_AGUARDANDO_CARREGAMENTO',
  'AGUARDANDO_COLETA',
  'EM_COLETA',
];

// ============================================================================
// Módulo 7 — Integração ERP
// ============================================================================

export const FormatoExportacaoSchema = z.enum(['csv', 'json']);
export type FormatoExportacao = z.infer<typeof FormatoExportacaoSchema>;

// ============================================================================
// Módulo 8 — Portaria
// ============================================================================

/** Tipo de operação que o veículo vem realizar no pátio (critério "gatilho da automação operacional"). */
export const TipoOperacaoPortariaSchema = z.enum(['DESCARGA', 'CARGA', 'TRANSITO']);
export type TipoOperacaoPortaria = z.infer<typeof TipoOperacaoPortariaSchema>;

/**
 * Máquina de estados da entrada de portaria: Aguardando conferência (recém
 * registrada pelo porteiro) -> Conferido (documentos conferidos) -> Liberado
 * no pátio -> Aguardando saída -> Saída registrada. `CANCELADA` é o único
 * estado de exceção (ex: veículo não autorizado, entrada duplicada).
 */
export const StatusPortariaEntradaSchema = z.enum([
  'AGUARDANDO_CONFERENCIA',
  'CONFERIDO',
  'LIBERADO_PATIO',
  'AGUARDANDO_SAIDA',
  'SAIDA_REGISTRADA',
  'CANCELADA',
]);
export type StatusPortariaEntrada = z.infer<typeof StatusPortariaEntradaSchema>;

export const TRANSICOES_STATUS_PORTARIA_ENTRADA: Record<
  StatusPortariaEntrada,
  StatusPortariaEntrada[]
> = {
  AGUARDANDO_CONFERENCIA: ['CONFERIDO', 'CANCELADA'],
  CONFERIDO: ['LIBERADO_PATIO', 'CANCELADA'],
  LIBERADO_PATIO: ['AGUARDANDO_SAIDA', 'CANCELADA'],
  AGUARDANDO_SAIDA: ['SAIDA_REGISTRADA', 'CANCELADA'],
  SAIDA_REGISTRADA: [],
  CANCELADA: [],
};

export const TipoDocumentoPortariaSchema = z.enum([
  'CRT',
  'ORDEM_COLETA',
  'NOTA_FISCAL',
  'CNH',
  'OUTRO',
]);
export type TipoDocumentoPortaria = z.infer<typeof TipoDocumentoPortariaSchema>;

export const TipoOrdemServicoSchema = z.enum(['DESCARGA', 'CARGA']);
export type TipoOrdemServico = z.infer<typeof TipoOrdemServicoSchema>;

export const StatusOrdemServicoSchema = z.enum([
  'ABERTA',
  'EM_EXECUCAO',
  'FINALIZADA',
  'CANCELADA',
]);
export type StatusOrdemServico = z.infer<typeof StatusOrdemServicoSchema>;

export const TRANSICOES_STATUS_ORDEM_SERVICO: Record<StatusOrdemServico, StatusOrdemServico[]> = {
  ABERTA: ['EM_EXECUCAO', 'CANCELADA'],
  EM_EXECUCAO: ['FINALIZADA', 'CANCELADA'],
  FINALIZADA: [],
  CANCELADA: [],
};
