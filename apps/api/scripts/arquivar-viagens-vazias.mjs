// Deduplicação: arquiva (soft delete, deleted_at) as viagens PROGRAMADA vazias criadas pela 1ª importação [IA]
// (sem CRT, sem cargas, data_programacao = created_at) e salva backup completo em ../../backup-viagens-stub-arquivadas.json.
// Uso (em apps/api): node scripts/arquivar-viagens-vazias.mjs            -> só relatório
//                   node scripts/arquivar-viagens-vazias.mjs aplicar    -> aplica
// Reverter: update viagens set deleted_at = null where id in (ids do backup).
process.loadEnvFile('.env');
import { writeFileSync } from 'node:fs';
const { createClient } = await import('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const aplicar = process.argv[2] === 'aplicar';
const todas = async (t, sel = '*') => {
  const out = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await sb.from(t).select(sel).is('deleted_at', null).range(i, i + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
};
const viagens = await todas('viagens');
const { data: cg } = await sb.from('viagem_cargas').select('viagem_id').limit(20000);
const comCarga = new Set(cg.map((c) => c.viagem_id));
const stubs = viagens.filter((v) => v.status === 'PROGRAMADA' && !v.codigo_externo && !v.numero_crt && !comCarga.has(v.id) && Math.abs(Date.parse(v.data_programacao) - Date.parse(v.created_at)) < 5000);

// Nenhuma outra tabela pode apontar para eles.
const ids = stubs.map((s) => s.id);
for (const t of ['status_viagem_historico', 'viagem_motorista_historico', 'expedicoes', 'recebimentos', 'fretes', 'documentos_embarque', 'eventos_risco', 'registros_jornada', 'validacoes_pre_embarque', 'portaria_entradas', 'eventos_fronteira']) {
  let n = 0;
  for (let i = 0; i < ids.length; i += 150) {
    const r = await sb.from(t).select('*', { count: 'exact', head: true }).in('viagem_id', ids.slice(i, i + 150));
    if (r.error) { n = `(${r.error.message.slice(0, 50)})`; break; }
    n += r.count;
  }
  console.log('referências em', t, n);
}

// Duplicados de cadastro (só relatório).
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
for (const [t, campo] of [['veiculos', 'placa'], ['motoristas', 'nome_completo'], ['clientes', 'nome']]) {
  const rows = await todas(t);
  const g = new Map();
  for (const r of rows) g.set(norm(r[campo]), [...(g.get(norm(r[campo])) ?? []), r]);
  const dup = [...g.values()].filter((x) => x.length > 1);
  console.log(t, rows.length, 'duplicados:', dup.map((d) => d.map((x) => x[campo]).join(' = ')));
}

console.log('stubs a arquivar', stubs.length);
if (aplicar) {
  writeFileSync('../../backup-viagens-stub-arquivadas.json', JSON.stringify(stubs, null, 1));
  const agora = new Date().toISOString();
  let ok = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const { error, count } = await sb.from('viagens').update({ deleted_at: agora }, { count: 'exact' }).in('id', ids.slice(i, i + 100)).is('deleted_at', null).eq('status', 'PROGRAMADA');
    if (error) throw error;
    ok += count;
  }
  await sb.from('audit_logs').insert({ action: 'DELETE', entity: 'viagens', entity_id: null, changes: { motivo: 'Deduplicação: viagens PROGRAMADA vazias criadas pela importação [IA] de 29/09 (sem CRT, sem cargas, sem histórico)', quantidade: ok, soft_delete: true, backup: 'backup-viagens-stub-arquivadas.json' } }).then((r) => r.error && console.log('audit:', r.error.message));
  console.log('arquivadas (deleted_at) =', ok, 'em', agora);
}
