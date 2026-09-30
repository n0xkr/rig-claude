// Reset dos dados que vieram das planilhas, para reimportar do zero: viagens (com cargas e históricos),
// veículos, motoristas, clientes, lotes de importação (import_datasets) e pedidos gerados pela
// importação (ia_solicitacoes). Mantém usuários, auditoria, respostas dadas à IA (ia_conhecimento) e
// tudo que foi lançado à mão em outros módulos: uma viagem com frete, evento de fronteira, portaria,
// OS, expedição etc. fica — e com ela o cavalo, as carretas e o motorista que ela usa.
// Antes de apagar salva TUDO em ../../backup-reset-importacao-<data>.json.
// Uso (em apps/api): node scripts/resetar-dados-importados.mjs            -> só relatório
//                   node scripts/resetar-dados-importados.mjs aplicar    -> aplica
process.loadEnvFile('.env');
import { writeFileSync } from 'node:fs';
const { createClient } = await import('@supabase/supabase-js');
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const aplicar = process.argv[2] === 'aplicar';

const todas = async (t) => {
  const out = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await sb.from(t).select('*').order('id').range(i, i + 999);
    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) return [];
      throw new Error(`${t}: ${error.message}`);
    }
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
};

const TABELAS = [
  'viagens', 'viagem_cargas', 'viagem_motorista_historico', 'status_viagem_historico', 'veiculos', 'motoristas',
  'motorista_documentos', 'clientes', 'import_datasets', 'ia_solicitacoes',
];
const backup = {};
for (const t of TABELAS) backup[t] = await todas(t);

// Viagens usadas por outros módulos (lançamentos manuais) ficam.
const viagensUsadas = new Set();
for (const t of [
  'fretes', 'eventos_fronteira', 'documentos_embarque', 'eventos_risco', 'expedicoes', 'recebimentos', 'portaria_entradas',
  'ordens_servico', 'registros_jornada', 'jornadas_motorista', 'apolices_seguro', 'validacoes_pre_embarque',
]) {
  for (const r of await todas(t)) if (r.viagem_id) viagensUsadas.add(r.viagem_id);
}
const viagensFicam = backup.viagens.filter((v) => viagensUsadas.has(v.id));
const placasFicam = new Set(viagensFicam.flatMap((v) => [v.placa_cavalo, v.placa_carreta, v.placa_carreta_2]).filter(Boolean));
const veiculosIdFicam = new Set(viagensFicam.map((v) => v.veiculo_id).filter(Boolean));
for (const t of ['manutencoes_veiculo', 'rastreadores', 'apolices_seguro']) for (const r of await todas(t)) if (r.veiculo_id) veiculosIdFicam.add(r.veiculo_id);
const motoristasFicam = new Set(viagensFicam.map((v) => v.motorista_id).filter(Boolean));
for (const t of ['jornadas_motorista', 'registros_ponto', 'registros_jornada', 'portaria_entradas']) for (const r of await todas(t)) if (r.motorista_id) motoristasFicam.add(r.motorista_id);

const apagar = {
  ia_solicitacoes: backup.ia_solicitacoes.map((r) => r.id),
  viagens: backup.viagens.filter((v) => !viagensUsadas.has(v.id)).map((v) => v.id),
  motoristas: backup.motoristas.filter((m) => !motoristasFicam.has(m.id)).map((m) => m.id),
  veiculos: backup.veiculos.filter((v) => !placasFicam.has(v.placa) && !veiculosIdFicam.has(v.id)).map((v) => v.id),
  clientes: backup.clientes.map((c) => c.id),
  import_datasets: backup.import_datasets.map((d) => d.id),
};

console.log('Hoje no banco:', Object.fromEntries(TABELAS.map((t) => [t, backup[t].length])));
console.log('Ficam (usados por lançamentos manuais):', {
  viagens: viagensFicam.map((v) => `${v.placa_cavalo} ${v.origem} -> ${v.destino} (${v.status})`),
  veiculos: backup.veiculos.filter((v) => !apagar.veiculos.includes(v.id)).map((v) => v.placa),
  motoristas: backup.motoristas.filter((m) => !apagar.motoristas.includes(m.id)).map((m) => m.nome_completo),
});
console.log('Serão apagados:', Object.fromEntries(Object.entries(apagar).map(([t, ids]) => [t, ids.length])));
console.log('(cargas, históricos de status e de motorista das viagens apagadas saem junto — on delete cascade)');

if (!aplicar) {
  console.log('\nSó relatório. Para aplicar: node scripts/resetar-dados-importados.mjs aplicar');
  process.exit(0);
}

const arquivo = `../../backup-reset-importacao-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
writeFileSync(arquivo, JSON.stringify(backup));
console.log(`Backup completo salvo em ${arquivo}`);

// Viagens que ficam apontam para veículos/motoristas que ficam; o resto sai na ordem das FKs.
for (const [t, ids] of Object.entries(apagar)) {
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await sb.from(t).delete().in('id', ids.slice(i, i + 200));
    if (error) throw new Error(`${t}: ${error.message}`);
  }
  console.log(`${t}: ${ids.length} apagado(s)`);
}
for (const t of TABELAS) {
  const { count } = await sb.from(t).select('*', { count: 'exact', head: true });
  console.log(`${t.padEnd(28)} agora: ${count}`);
}
