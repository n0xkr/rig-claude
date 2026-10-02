-- ============================================================================
-- 0017 — Integridade transacional, refresh token rotativo, endurecimento RLS
-- Idempotente (seguro rodar mais de uma vez). Pré-requisitos: 0013 → 0016.
-- Ordem de segurança: backup → migration → validação → testes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Refresh tokens rotativos (jti persistido, uso único, revogação de família)
-- ----------------------------------------------------------------------------
create table if not exists refresh_tokens (
  jti uuid primary key,
  family_id uuid not null,
  user_id uuid not null references profiles(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_refresh_tokens_user on refresh_tokens(user_id);
create index if not exists idx_refresh_tokens_family on refresh_tokens(family_id);
create index if not exists idx_refresh_tokens_expires on refresh_tokens(expires_at);
alter table refresh_tokens enable row level security; -- sem policies: só service-role

-- ----------------------------------------------------------------------------
-- 2. Ledger de estoque atômico: movimentação + saldo + status do endereço
--    numa única transação, com lock de linha e saldo nunca negativo.
-- ----------------------------------------------------------------------------
create or replace function registrar_movimentacao_estoque(
  p_mov jsonb,
  p_origem_delta numeric,
  p_destino_delta numeric
) returns movimentacoes_estoque
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_mov movimentacoes_estoque;
  v_produto uuid := (p_mov->>'produto_id')::uuid;
  v_origem uuid := nullif(p_mov->>'endereco_origem_id', '')::uuid;
  v_destino uuid := nullif(p_mov->>'endereco_destino_id', '')::uuid;
  v_end uuid;
  v_delta numeric;
  v_tem_saldo boolean;
begin
  -- aplica primeiro o lado que reduz (lock + condição), depois o que aumenta
  if v_origem is not null and p_origem_delta <> 0 then
    insert into estoque (produto_id, endereco_id, quantidade)
      values (v_produto, v_origem, 0)
      on conflict (produto_id, endereco_id) do nothing;
    update estoque
       set quantidade = quantidade + p_origem_delta, updated_at = now()
     where produto_id = v_produto and endereco_id = v_origem
       and quantidade + p_origem_delta >= 0;
    if not found then
      raise exception 'SALDO_INSUFICIENTE' using errcode = 'P0001';
    end if;
  end if;
  if v_destino is not null and p_destino_delta <> 0 then
    insert into estoque (produto_id, endereco_id, quantidade)
      values (v_produto, v_destino, 0)
      on conflict (produto_id, endereco_id) do nothing;
    update estoque
       set quantidade = quantidade + p_destino_delta, updated_at = now()
     where produto_id = v_produto and endereco_id = v_destino
       and quantidade + p_destino_delta >= 0;
    if not found then
      raise exception 'SALDO_INSUFICIENTE' using errcode = 'P0001';
    end if;
  end if;

  insert into movimentacoes_estoque (
    produto_id, tipo_movimentacao, quantidade, endereco_origem_id, endereco_destino_id,
    recebimento_id, expedicao_id, inventario_id, referencia_documento, observacoes, created_by
  ) values (
    v_produto,
    (p_mov->>'tipo_movimentacao')::tipo_movimentacao_estoque,
    (p_mov->>'quantidade')::numeric,
    v_origem,
    v_destino,
    nullif(p_mov->>'recebimento_id', '')::uuid,
    nullif(p_mov->>'expedicao_id', '')::uuid,
    nullif(p_mov->>'inventario_id', '')::uuid,
    nullif(p_mov->>'referencia_documento', ''),
    nullif(p_mov->>'observacoes', ''),
    nullif(p_mov->>'created_by', '')::uuid
  ) returning * into v_mov;

  foreach v_end in array array_remove(array[v_origem, v_destino], null) loop
    select exists (select 1 from estoque where endereco_id = v_end and quantidade > 0)
      into v_tem_saldo;
    update enderecos_armazem
       set status = case when v_tem_saldo then 'OCUPADO' else 'LIVRE' end
     where id = v_end and status <> 'BLOQUEADO'
       and status <> case when v_tem_saldo then 'OCUPADO' else 'LIVRE' end;
  end loop;

  return v_mov;
end;
$$;
revoke all on function registrar_movimentacao_estoque(jsonb, numeric, numeric) from public, anon, authenticated;
grant execute on function registrar_movimentacao_estoque(jsonb, numeric, numeric) to service_role;

-- ----------------------------------------------------------------------------
-- 3. Pagamento de frete atômico (lock do frete, estado, limite de saldo)
-- ----------------------------------------------------------------------------
create or replace function registrar_pagamento_frete(
  p_frete_id uuid,
  p_pagamento jsonb,
  p_user uuid
) returns pagamentos_frete
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_frete fretes;
  v_pago numeric;
  v_lanc numeric;
  v_saldo numeric;
  v_valor numeric := (p_pagamento->>'valor_pago')::numeric;
  v_status text := coalesce(p_pagamento->>'status', 'PENDENTE');
  v_row pagamentos_frete;
begin
  select * into v_frete from fretes where id = p_frete_id and deleted_at is null for update;
  if not found then
    raise exception 'FRETE_NAO_ENCONTRADO' using errcode = 'P0002';
  end if;
  if v_frete.status_fechamento <> 'APROVADO' then
    raise exception 'FRETE_NAO_APROVADO:%', v_frete.status_fechamento using errcode = 'P0001';
  end if;
  select coalesce(sum(valor), 0) into v_lanc
    from frete_lancamentos where frete_id = p_frete_id and deleted_at is null;
  select coalesce(sum(valor_pago), 0) into v_pago
    from pagamentos_frete
   where frete_id = p_frete_id and deleted_at is null and status in ('CONFIRMADO', 'PENDENTE');
  v_saldo := v_frete.valor_contratado - v_lanc - v_pago;
  if v_valor > v_saldo then
    raise exception 'PAGAMENTO_EXCEDE_SALDO:%', v_saldo using errcode = 'P0001';
  end if;

  insert into pagamentos_frete
  select * from jsonb_populate_record(
    null::pagamentos_frete,
    p_pagamento || jsonb_build_object('frete_id', p_frete_id, 'created_by', p_user)
  )
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function registrar_pagamento_frete(uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function registrar_pagamento_frete(uuid, jsonb, uuid) to service_role;

-- ----------------------------------------------------------------------------
-- 4. Fretes: OPERADOR só edita linhas ainda em ABERTO/EM_CONFERENCIA (D4) e
--    trigger bloqueia reabertura/transição inválida via PostgREST direto.
-- ----------------------------------------------------------------------------
drop policy if exists fretes_update_admin_operador on fretes;
create policy fretes_update_admin_operador on fretes
  for update using (
    current_user_role() in ('SUPERADMIN', 'ADMIN')
    or (current_user_role() = 'OPERADOR' and status_fechamento in ('ABERTO', 'EM_CONFERENCIA'))
  )
  with check (
    current_user_role() in ('SUPERADMIN', 'ADMIN')
    or status_fechamento in ('ABERTO', 'EM_CONFERENCIA')
  );

create or replace function trg_fretes_transicao() returns trigger
language plpgsql set search_path = public as $$
begin
  -- Chamadas da API (service-role, auth.uid() nulo) já validam a máquina de estados;
  -- aqui protege-se o acesso direto com JWT de usuário. SUPERADMIN é isento.
  if auth.uid() is not null and current_user_role() is distinct from 'SUPERADMIN' then
    if old.status_fechamento in ('PAGO') and new.status_fechamento <> old.status_fechamento then
      raise exception 'Frete PAGO não pode mudar de status' using errcode = 'P0001';
    end if;
    if old.status_fechamento in ('APROVADO', 'PAGO')
       and new.valor_contratado is distinct from old.valor_contratado then
      raise exception 'Valor contratado congelado após a aprovação' using errcode = 'P0001';
    end if;
    if old.status_fechamento = 'APROVADO' and new.status_fechamento in ('ABERTO', 'EM_CONFERENCIA') then
      raise exception 'Transição inválida: APROVADO -> %', new.status_fechamento using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_fretes_transicao on fretes;
create trigger trg_fretes_transicao before update on fretes
  for each row execute function trg_fretes_transicao();

-- ----------------------------------------------------------------------------
-- 5. VISITANTE sem acesso direto a dados financeiros e documentos pessoais (D3/B6)
-- ----------------------------------------------------------------------------
drop policy if exists fretes_select_all_roles on fretes;
create policy fretes_select_all_roles on fretes
  for select using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));
drop policy if exists frete_lancamentos_select_all_roles on frete_lancamentos;
create policy frete_lancamentos_select_all_roles on frete_lancamentos
  for select using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));
drop policy if exists pagamentos_frete_select_all_roles on pagamentos_frete;
create policy pagamentos_frete_select_all_roles on pagamentos_frete
  for select using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));
drop policy if exists motorista_documentos_select on motorista_documentos;
create policy motorista_documentos_select on motorista_documentos
  for select using (current_user_role() in ('SUPERADMIN', 'ADMIN', 'OPERADOR'));

-- ----------------------------------------------------------------------------
-- 6. Ledgers imutáveis (jornada): bloqueia UPDATE/DELETE por trigger
-- ----------------------------------------------------------------------------
create or replace function trg_bloquear_alteracao() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and current_user_role() is distinct from 'SUPERADMIN' then
    raise exception 'Registro imutável (%.%)', tg_table_name, tg_op using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists trg_registros_jornada_imutavel on registros_jornada;
create trigger trg_registros_jornada_imutavel before update or delete on registros_jornada
  for each row execute function trg_bloquear_alteracao();

-- ----------------------------------------------------------------------------
-- 7. Constraints de sanidade e índices de FK
-- ----------------------------------------------------------------------------
create index if not exists idx_mov_estoque_origem on movimentacoes_estoque(endereco_origem_id);
create index if not exists idx_mov_estoque_destino on movimentacoes_estoque(endereco_destino_id);
create index if not exists idx_viagens_status_data on viagens(status, data_programacao);

-- ----------------------------------------------------------------------------
-- 8. Idempotência de mutações (cabeçalho Idempotency-Key, usado pela fila offline)
-- ----------------------------------------------------------------------------
create table if not exists idempotency_keys (
  key text not null,
  user_id uuid not null,
  method text not null,
  path text not null,
  status_code int,
  response jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);
create index if not exists idx_idempotency_created on idempotency_keys(created_at);
alter table idempotency_keys enable row level security; -- só service-role
