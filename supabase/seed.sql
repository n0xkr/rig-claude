-- ============================================================================
-- Seed data de desenvolvimento - Rigabras Transportes
-- Executar após 0001_initial.sql e 0002_rls_policies.sql em um projeto
-- Supabase de desenvolvimento/staging. NUNCA rodar em produção.
-- Observação: os registros de "profiles" pressupõem que os usuários
-- correspondentes já existam em auth.users (crie-os via Supabase Studio ou
-- supabase.auth.admin.createUser antes de rodar este seed).
-- ============================================================================

-- Veículos (frota própria Scania + carretas Randon, exemplos)
insert into veiculos (placa, tipo, marca, modelo, ano_fabricacao, frota_propria, capacidade_kg, rastreador_autotrac_id) values
  ('IRZ1A23', 'CAVALO', 'Scania', 'R450', 2022, true, 45000, 'AUTOTRAC-0001'),
  ('IRZ1B45', 'CAVALO', 'Scania', 'R500', 2023, true, 45000, 'AUTOTRAC-0002'),
  ('IWX9C88', 'CARRETA_SIDER', 'Randon', 'Sider 15,45m', 2021, true, 32000, null),
  ('IWX9D77', 'CARRETA_ABERTA', 'Randon', 'Graneleira 15m', 2020, false, 30000, null);

-- Motoristas
insert into motoristas (nome_completo, cpf, cnh, cnh_categoria, cnh_validade, telefone, frota_propria) values
  ('Carlos Eduardo Ferreira', '111.111.111-11', '11122233344', 'E', '2028-05-10', '(55) 99999-0001', true),
  ('Jose Antonio Gonzalez', '222.222.222-22', '22233344455', 'E', '2027-11-20', '(55) 99999-0002', false);

-- Viagem de exemplo: Uruguaiana -> Paso de los Libres -> Buenos Aires
insert into viagens (
  numero_crt, numero_mic_dta, placa_cavalo,
  veiculo_id, motorista_id, status, origem, destino, pais_destino,
  data_programacao, peso_kg, valor_frete
)
select
  'CRT-2026-000123',
  'MICDTA-2026-000456',
  'IRZ1A23',
  v.id,
  m.id,
  'EM_TRANSITO',
  'Uruguaiana/RS',
  'Buenos Aires/AR',
  'AR',
  now() - interval '2 days',
  28000,
  18500.00
from veiculos v, motoristas m
where v.placa = 'IRZ1A23' and m.cpf = '111.111.111-11'
limit 1;

-- Evento de risco de exemplo
insert into eventos_risco (viagem_id, tipo, severidade, descricao, status, origem_deteccao)
select id, 'ATRASO', 'MEDIA', 'Fila de espera na fronteira acima da média histórica (Multilog).', 'ABERTO', 'MANUAL'
from viagens where numero_crt = 'CRT-2026-000123';

-- Apólice de exemplo (RCTR-VI - Carta Azul)
insert into apolices_seguro (tipo, numero_apolice, seguradora, veiculo_id, valor_segurado, vigencia_inicio, vigencia_fim)
select 'RCTR_VI', 'AP-RCTRVI-2026-001', 'Seguradora Exemplo S.A.', id, 500000.00, '2026-01-01', '2026-12-31'
from veiculos where placa = 'IRZ1A23';
