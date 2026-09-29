// Mescla veículos duplicados por hífen (IIK-3294 = IIK3294, CLJ-8887 = CLJ8887): copia dados que faltam para o original,
// repassa viagens/motoristas/manutenções e arquiva (soft delete) a cópia.
// Uso (em apps/api): node scripts/mesclar-veiculos-duplicados.mjs [aplicar]
process.loadEnvFile('.env');
const { createClient } = await import('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const aplicar = process.argv[2] === 'aplicar';
for (const [manter, dup] of [['IIK-3294', 'IIK3294'], ['CLJ-8887', 'CLJ8887']]) {
  const { data: vs } = await sb.from('veiculos').select('*').in('placa', [manter, dup]).is('deleted_at', null);
  const a = vs.find((v) => v.placa === manter), b = vs.find((v) => v.placa === dup);
  const refs = {};
  for (const [t, col] of [['viagens', 'placa_cavalo'], ['viagens', 'placa_carreta'], ['viagens', 'veiculo_id'], ['manutencoes_veiculo', 'veiculo_id'], ['motoristas', 'placa_habitual']]) {
    const val = col === 'veiculo_id' ? b.id : dup;
    const r = await sb.from(t).select('id', { count: 'exact', head: true }).eq(col, val);
    refs[`${t}.${col}`] = r.error ? r.error.message.slice(0, 40) : r.count;
  }
  const falta = Object.fromEntries(Object.entries(b).filter(([k, v]) => v !== null && (a[k] === null || a[k] === undefined) && !['id', 'placa', 'created_at', 'updated_at', 'deleted_at'].includes(k)));
  console.log(manter, '<-', dup, { a: { st: a.status_operacional, mot: a.motorista_atual, created: a.created_at }, b: { st: b.status_operacional, mot: b.motorista_atual, created: b.created_at }, refs, falta });
  if (!aplicar) continue;
  if (Object.keys(falta).length) await sb.from('veiculos').update(falta).eq('id', a.id);
  for (const col of ['placa_cavalo', 'placa_carreta', 'placa_carreta_2']) await sb.from('viagens').update({ [col]: manter }).eq(col, dup);
  await sb.from('viagens').update({ veiculo_id: a.id }).eq('veiculo_id', b.id);
  await sb.from('motoristas').update({ placa_habitual: manter }).eq('placa_habitual', dup);
  const r = await sb.from('manutencoes_veiculo').update({ veiculo_id: a.id }).eq('veiculo_id', b.id);
  if (r.error && !/does not exist|schema cache/.test(r.error.message)) throw r.error;
  const { error } = await sb.from('veiculos').update({ deleted_at: new Date().toISOString() }).eq('id', b.id);
  if (error) throw error;
  console.log('mesclado', dup, '->', manter);
}
