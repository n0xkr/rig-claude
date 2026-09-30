import { normTexto } from '../../iaSolicitacoes/leitura.js';
import type { Registro } from './interpretacao.js';
import { comoPlaca } from './interpretacao.js';

/**
 * Retrato diário da frota ("HISTORICO DE POSIÇÕES"): cada linha é um cavalo NUM DIA, não uma
 * viagem. A mesma viagem aparece por vários dias seguidos (mesmo cliente e rota) até o cavalo
 * voltar ("RETORNANDO VAZIO DA BALL PY", "RETORNOU FRIMETAL"). Aqui cada sequência de dias vira
 * UM registro de viagem; dias sem viagem (sem motorista, parado sem cliente) só separam viagens.
 */

const RETORNO =
  /^(?:vai\s+)?(?:retornando|retornou|retornado|retornar|voltando|voltou|voltar|ret)\b\.?\s*(?:vazi[oa]\s+)?(?:d[aeo]s?\s+)?(.*?)(?:\s+vazi[oa])?$/i;
const VAZIO_NO = /^vazi[oa]\s+(?:n[ao]s?|d[aeo]s?)\s+(.+)$/i;
/** Texto na coluna de cliente que é recado sobre o veículo ("VEICULOS JDE5H08 E JDE5H10 REMONTADOS"). */
const NAO_CLIENTE = /\b(veiculos?|remontad\w*|manutenc\w*|oficina|sem motorista)\b/;

/** "RETORNANDO VAZIO DA BALL PY" -> { cliente: "BALL PY", retorno: true }. "VAZIO" não é cliente. */
export function clienteDoTexto(texto: unknown): { cliente: string | undefined; retorno: boolean } {
  if (typeof texto !== 'string' || !texto.trim()) return { cliente: undefined, retorno: false };
  const t = texto.trim().replace(/\s+/g, ' ');
  if (NAO_CLIENTE.test(normTexto(t)) || t.split(' ').some((p) => comoPlaca(p))) return { cliente: undefined, retorno: false };
  const m = t.match(RETORNO) ?? t.match(VAZIO_NO);
  if (m) {
    const resto = m[1]?.trim();
    return { cliente: resto && !/^vazi[oa]$/i.test(resto) ? resto : undefined, retorno: true };
  }
  if (/^vazi[oa]$/i.test(t)) return { cliente: undefined, retorno: false };
  return { cliente: t, retorno: false };
}

/** Mesmo cliente escrito de outro jeito ("RAROZ" x "TRANSVALLE/RAROZ", "TUBOS TRANSELETRIC" x "TUBOS TRANSLETRIC"). */
function clientesRelacionados(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const pa = a.split(' ').filter((w) => w.length >= 4);
  const pb = new Set(b.split(' ').filter((w) => w.length >= 4));
  return pa.some((w) => pb.has(w));
}

const RET_CARREGADO = / ret carregado | retorno carregado | retornando carregado /;
const ehVazio = (v: unknown) => typeof v === 'string' && /^vazi[oa]$/i.test(v.trim());

/**
 * Colunas "Cliente2 / Origem (Ret) / Destino (Ret)" são a perna de volta (outra carga, outro
 * cliente). A linha está NA volta quando a ida está vazia ou o status diz retorno carregado;
 * aí a viagem daquele dia é a de volta.
 */
function pernaDoDia(r: Registro): Registro {
  const c = r.campos;
  const clienteVolta = c.cliente_retorno && !ehVazio(c.cliente_retorno) ? c.cliente_retorno : undefined;
  if (!clienteVolta && !c.origem_retorno && !c.destino_retorno) return r;
  const idaVazia = !c.cliente && !c.origem && !c.destino;
  const textos = ` ${normTexto([c.status_texto, c.observacoes].filter(Boolean).join(' '))} `;
  if (!idaVazia && !RET_CARREGADO.test(textos)) return r;
  const campos: Record<string, unknown> = { ...c, cliente: clienteVolta, origem: c.origem_retorno, destino: c.destino_retorno };
  delete campos.cliente_retorno;
  delete campos.origem_retorno;
  delete campos.destino_retorno;
  const ida = [c.cliente, c.origem, c.destino].filter(Boolean).join(' · ');
  return { ...r, campos, extras: ida ? { ...r.extras, 'Viagem de ida': ida } : r.extras };
}

const dia = (r: Registro) => {
  const d = r.campos.data_programacao ?? r.campos.data_coleta;
  return typeof d === 'string' ? d.slice(0, 10) : null;
};
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

/** A aba é um retrato diário? (sem ID/CRT, uma linha por cavalo por dia, vários dias por cavalo) */
export function ehRetratoDiario(regs: Registro[]): boolean {
  if (regs.length < 20) return false;
  if (regs.some((r) => r.campos.codigo_externo || r.campos.numero_crt || r.campos.numero_danfe)) return false;
  const comDia = regs.filter((r) => dia(r) && comoPlaca(r.campos.placa_cavalo));
  if (comDia.length < regs.length * 0.9) return false;
  const pares = new Set(comDia.map((r) => `${String(r.campos.placa_cavalo)}|${dia(r)}`));
  if (pares.size < comDia.length * 0.95) return false;
  const diasPorCavalo = new Map<string, Set<string>>();
  for (const r of comDia) {
    const p = String(r.campos.placa_cavalo);
    diasPorCavalo.set(p, (diasPorCavalo.get(p) ?? new Set()).add(dia(r)!));
  }
  const dias = new Set(comDia.map(dia));
  const cavalosRecorrentes = [...diasPorCavalo.values()].filter((s) => s.size >= 3).length;
  return dias.size >= 3 && cavalosRecorrentes >= diasPorCavalo.size * 0.5;
}

interface Trecho {
  cliente: string;
  chave: string;
  retornou: boolean;
  linhas: Registro[];
}

const fmt = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/** Junta os dias de cada viagem. Aba que não é retrato diário volta como veio. */
export function consolidarRetratoDiario(
  regs: Registro[],
): { registros: Registro[]; viagens: number; dias: number; descartados: number } | null {
  if (!ehRetratoDiario(regs)) return null;
  const ultimoDia = regs.map(dia).filter((d): d is string => !!d).sort().at(-1)!;
  const porCavalo = new Map<string, Registro[]>();
  for (const r of regs) {
    const p = comoPlaca(r.campos.placa_cavalo);
    if (!p || !dia(r)) continue;
    porCavalo.set(p, [...(porCavalo.get(p) ?? []), r]);
  }

  const saida: Registro[] = [];
  let descartados = 0;
  for (const [, linhas] of porCavalo) {
    linhas.sort((a, b) => dia(a)!.localeCompare(dia(b)!));
    const trechos: Trecho[] = [];
    let atual: Trecho | null = null;
    let diaAnterior: string | null = null;
    for (const bruta of linhas) {
      const r = pernaDoDia(bruta);
      const d = dia(r)!;
      const { cliente, retorno } = clienteDoTexto(r.campos.cliente);
      const textos = ` ${normTexto([r.campos.status_texto, r.campos.observacoes, r.campos.cliente].filter(Boolean).join(' '))} `;
      const origem = normTexto(r.campos.origem);
      const destino = normTexto(r.campos.destino);
      const lacuna = diaAnterior ? diasEntre(diaAnterior, d) : 0;
      diaAnterior = d;
      // Dia parado (sem motorista, em manutenção, sem cliente nem rota): separa as viagens.
      if ((!cliente && !origem && !destino) || / manutenc| oficina /.test(textos)) {
        atual = null;
        continue;
      }
      const cli = normTexto(cliente);
      const chave = `${cli}|${origem}|${destino}`;
      const continua =
        atual !== null &&
        lacuna <= 6 &&
        (retorno
          ? !cli || clientesRelacionados(cli, atual.cliente)
          : !atual.retornou && (chave === atual.chave || clientesRelacionados(cli, atual.cliente)));
      if (continua) {
        atual!.linhas.push(r);
        if (retorno) atual!.retornou = true;
      } else {
        atual = { cliente: cli, chave, retornou: retorno, linhas: [r] };
        trechos.push(atual);
      }
    }

    for (const t of trechos) {
      const primeira = t.linhas[0]!;
      const ultima = t.linhas[t.linhas.length - 1]!;
      const ida = t.linhas.filter((l) => !clienteDoTexto(l.campos.cliente).retorno);
      const valor = (campo: string, fonte = ida.length ? ida : t.linhas) =>
        fonte.map((l) => l.campos[campo]).find((v) => v !== undefined && v !== null && v !== '');
      const inicio = dia(primeira)!;
      const fim = dia(ultima)!;
      const encerrada = fim < ultimoDia;
      // Rota da viagem = a última completa (a rota muda: "URUGUAIANA > SÃO GABRIEL" para ir
      // carregar, depois "SÃO GABRIEL > JARAGUA DO SUL" carregado).
      const comRota =
        [...ida].reverse().find((l) => l.campos.origem && l.campos.destino) ??
        ida.find((l) => l.campos.origem || l.campos.destino);
      // Pedaço sem rota nenhuma e já terminado (ex.: só o fim de um retorno no 1º dia do
      // histórico) não tem o que registrar como viagem.
      if (!comRota && encerrada) {
        descartados++;
        continue;
      }
      const cliente = clienteDoTexto(comRota?.campos.cliente ?? valor('cliente')).cliente;
      const campos: Record<string, unknown> = {
        placa_cavalo: primeira.campos.placa_cavalo,
        placa_carreta: valor('placa_carreta'),
        placa_carreta_2: valor('placa_carreta_2'),
        motorista_nome: valor('motorista_nome'),
        motorista_codigo: valor('motorista_codigo'),
        cliente: cliente ?? (ida.length === 0 ? primeira.campos.cliente : undefined),
        origem: comRota?.campos.origem,
        destino: comRota?.campos.destino,
        data_programacao: primeira.campos.data_programacao ?? primeira.campos.data_coleta,
        pesquisa_gr: valor('pesquisa_gr'),
        checklist_ok: valor('checklist_ok'),
        smp_ok: valor('smp_ok'),
        // Situação da viagem = a do último dia em que ela aparece.
        status_texto: encerrada ? 'ENCERRADA' : ultima.campos.status_texto,
        observacoes: ultima.campos.observacoes,
        localizacao: encerrada ? undefined : ultima.campos.localizacao,
      };
      if (encerrada) campos.data_encerramento = new Date(`${fim}T18:00:00-03:00`).toISOString();
      for (const k of Object.keys(campos)) if (campos[k] === undefined || campos[k] === null) delete campos[k];
      // Volta prevista (vira a própria viagem quando o caminhão começa a voltar).
      const volta = t.linhas
        .map((l) => [l.campos.cliente_retorno, l.campos.origem_retorno, l.campos.destino_retorno])
        .find((x) => x[0] && !ehVazio(x[0]));
      const extras: Record<string, unknown> = {
        ...Object.assign({}, ...t.linhas.map((l) => l.extras)),
        ...(volta ? { 'Retorno previsto': volta.filter(Boolean).join(' · ') } : {}),
        'Período no histórico': inicio === fim ? fmt(inicio) : `${fmt(inicio)} a ${fmt(fim)}`,
        'Dias no histórico': t.linhas.length,
      };
      if (encerrada && typeof ultima.campos.status_texto === 'string') extras['Última situação'] = ultima.campos.status_texto;
      saida.push({
        arquivo: primeira.arquivo,
        aba: primeira.aba,
        linha: primeira.linha,
        campos,
        extras,
        retrato: true,
      });
    }
  }
  return { registros: saida, viagens: saida.length, dias: regs.length, descartados };
}
