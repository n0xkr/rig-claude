/**
 * Catálogo de modelos da Groq com capacidades e custo estimado (USD por
 * milhão de tokens; valores aproximados da tabela pública, servem só para
 * ordem de grandeza). Modelos fora do catálogo (vindos do env) recebem
 * capacidades inferidas pelo nome.
 *
 * A Groq troca modelos com frequência (llama-3.3-70b-versatile já respondeu
 * 404 nesta conta): por isso cada rota tem lista de reserva e o serviço passa
 * para o próximo em 404/model_not_found/decommission.
 */

export interface CapacidadesModelo {
  id: string;
  visao: boolean;
  /** Aceita `reasoning_effort` (low/medium/high) e gasta tokens de raciocínio. */
  raciocinio: boolean;
  maxImagens: number;
  /** Tamanho máximo somado das data URLs base64 numa requisição. */
  maxBytesBase64: number;
  maxMegapixels: number;
  maxTokensSaida: number;
  custoEntradaUsdPorMilhao: number;
  custoSaidaUsdPorMilhao: number;
  /** false = capacidades inferidas pelo nome. */
  conhecido: boolean;
}

const MB = 1024 * 1024;

const base = (id: string, c: Partial<CapacidadesModelo>): CapacidadesModelo => ({
  id,
  visao: false,
  raciocinio: false,
  maxImagens: 0,
  maxBytesBase64: 4 * MB,
  maxMegapixels: 33,
  maxTokensSaida: 8192,
  custoEntradaUsdPorMilhao: 0.5,
  custoSaidaUsdPorMilhao: 1,
  conhecido: true,
  ...c,
});

export const CATALOGO_MODELOS: Readonly<Record<string, CapacidadesModelo>> = {
  'openai/gpt-oss-120b': base('openai/gpt-oss-120b', {
    raciocinio: true,
    maxTokensSaida: 32_768,
    custoEntradaUsdPorMilhao: 0.15,
    custoSaidaUsdPorMilhao: 0.6,
  }),
  'openai/gpt-oss-20b': base('openai/gpt-oss-20b', {
    raciocinio: true,
    maxTokensSaida: 32_768,
    custoEntradaUsdPorMilhao: 0.075,
    custoSaidaUsdPorMilhao: 0.3,
  }),
  'llama-3.3-70b-versatile': base('llama-3.3-70b-versatile', {
    maxTokensSaida: 32_768,
    custoEntradaUsdPorMilhao: 0.59,
    custoSaidaUsdPorMilhao: 0.79,
  }),
  'llama-3.1-8b-instant': base('llama-3.1-8b-instant', {
    custoEntradaUsdPorMilhao: 0.05,
    custoSaidaUsdPorMilhao: 0.08,
  }),
  'meta-llama/llama-4-scout-17b-16e-instruct': base('meta-llama/llama-4-scout-17b-16e-instruct', {
    visao: true,
    maxImagens: 5,
    custoEntradaUsdPorMilhao: 0.11,
    custoSaidaUsdPorMilhao: 0.34,
  }),
  'meta-llama/llama-4-maverick-17b-128e-instruct': base('meta-llama/llama-4-maverick-17b-128e-instruct', {
    visao: true,
    maxImagens: 5,
    custoEntradaUsdPorMilhao: 0.2,
    custoSaidaUsdPorMilhao: 0.6,
  }),
};

/** Listas de reserva por rota (o modelo do env sempre vai à frente). */
export const RESERVA_TEXTO = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];
export const RESERVA_RAPIDO = ['openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'llama-3.1-8b-instant'];
export const RESERVA_VISAO = [
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
];

/** Capacidades de um modelo (inferidas pelo nome se não estiver no catálogo). */
export function capacidadesModelo(id: string): CapacidadesModelo {
  const conhecido = CATALOGO_MODELOS[id];
  if (conhecido) return conhecido;
  const n = id.toLowerCase();
  const visao = /scout|maverick|vision|llava|vl\b|-vl-/.test(n);
  return base(id, {
    visao,
    maxImagens: visao ? 5 : 0,
    raciocinio: /gpt-oss/.test(n),
    conhecido: false,
  });
}

export function custoEstimadoUsd(modelo: string | null, tokensEntrada: number, tokensSaida: number): number {
  if (!modelo) return 0;
  const c = capacidadesModelo(modelo);
  return (tokensEntrada * c.custoEntradaUsdPorMilhao + tokensSaida * c.custoSaidaUsdPorMilhao) / 1_000_000;
}

/** Monta a lista ordenada sem repetição: preferido → env → extras → reserva. */
export function listaDeModelos(...grupos: Array<ReadonlyArray<string | undefined | null> | string | undefined | null>): string[] {
  const out: string[] = [];
  for (const g of grupos) {
    const itens = typeof g === 'string' ? g.split(',') : (g ?? []);
    for (const m of itens) {
      const t = m?.trim();
      if (t && !out.includes(t)) out.push(t);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Checagem prévia de imagens (PAYLOAD_GRANDE antes de um 413 virar 502)
// ---------------------------------------------------------------------------

const RE_PREFIXO_IMAGEM = /^data:image\/(?:jpeg|jpg|png|webp|gif);base64,[A-Za-z0-9+/]/i;

export type VerificacaoImagens =
  | { ok: true; bytesBase64: number; megapixelsMax: number | null }
  | { ok: false; motivo: 'PAYLOAD_GRANDE' | 'ENTRADA_INVALIDA'; detalhe: string };

/** Largura/altura de PNG, JPEG, GIF ou WebP lendo só o cabeçalho; null se não reconhecer. */
export function dimensoesImagem(buf: Buffer): { largura: number; altura: number } | null {
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { largura: buf.readUInt32BE(16), altura: buf.readUInt32BE(20) };
  }
  if (buf.length >= 10 && buf.toString('ascii', 0, 4) === 'GIF8') {
    return { largura: buf.readUInt16LE(6), altura: buf.readUInt16LE(8) };
  }
  if (buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const tipo = buf.toString('ascii', 12, 16);
    if (tipo === 'VP8 ') return { largura: buf.readUInt16LE(26) & 0x3fff, altura: buf.readUInt16LE(28) & 0x3fff };
    if (tipo === 'VP8L') {
      const b0 = buf[21]!;
      const b1 = buf[22]!;
      const b2 = buf[23]!;
      const b3 = buf[24]!;
      return { largura: 1 + (b0 | ((b1 & 0x3f) << 8)), altura: 1 + ((b1 >> 6) | (b2 << 2) | ((b3 & 0x0f) << 10)) };
    }
    if (tipo === 'VP8X') return { largura: 1 + buf.readUIntLE(24, 3), altura: 1 + buf.readUIntLE(27, 3) };
    return null;
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marcador = buf[i + 1]!;
      if (marcador === 0xff) {
        i++;
        continue;
      }
      // SOF0..SOF15, exceto DHT (C4), JPG (C8) e DAC (CC).
      if (marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador)) {
        return { altura: buf.readUInt16BE(i + 5), largura: buf.readUInt16BE(i + 7) };
      }
      if (marcador === 0xda || marcador === 0xd9) return null;
      if (marcador >= 0xd0 && marcador <= 0xd7) {
        i += 2;
        continue;
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

/**
 * Valida as imagens contra as capacidades do modelo de visão: formato aceito,
 * quantidade, tamanho somado do base64 e megapixels (lidos do cabeçalho).
 */
export function verificarImagens(imagens: readonly string[], cap: CapacidadesModelo): VerificacaoImagens {
  if (!cap.visao) return { ok: false, motivo: 'ENTRADA_INVALIDA', detalhe: 'O modelo configurado não lê imagens.' };
  if (imagens.length === 0) return { ok: false, motivo: 'ENTRADA_INVALIDA', detalhe: 'Nenhuma imagem enviada.' };
  if (imagens.length > cap.maxImagens) {
    return {
      ok: false,
      motivo: 'PAYLOAD_GRANDE',
      detalhe: `Envie no máximo ${cap.maxImagens} imagens por leitura (recebidas: ${imagens.length}).`,
    };
  }
  let bytes = 0;
  let megapixelsMax: number | null = null;
  for (const [i, url] of imagens.entries()) {
    if (!RE_PREFIXO_IMAGEM.test(url)) {
      return {
        ok: false,
        motivo: 'ENTRADA_INVALIDA',
        detalhe: `Imagem ${i + 1}: use JPEG, PNG, WebP ou GIF em base64 (HEIC/PDF não são aceitos pela IA).`,
      };
    }
    bytes += url.length;
    const inicio = url.indexOf(',') + 1;
    // Cabeçalho basta para as dimensões (JPEG com EXIF grande pode precisar de ~200 KB).
    const cabeca = Buffer.from(url.slice(inicio, inicio + 262_144).replace(/\s/g, ''), 'base64');
    const dim = dimensoesImagem(cabeca);
    if (dim) {
      const mp = (dim.largura * dim.altura) / 1_000_000;
      megapixelsMax = Math.max(megapixelsMax ?? 0, mp);
      if (mp > cap.maxMegapixels) {
        return {
          ok: false,
          motivo: 'PAYLOAD_GRANDE',
          detalhe: `Imagem ${i + 1} tem ${mp.toFixed(1)} MP; o limite é ${cap.maxMegapixels} MP. Reduza a resolução.`,
        };
      }
    }
  }
  if (bytes > cap.maxBytesBase64) {
    return {
      ok: false,
      motivo: 'PAYLOAD_GRANDE',
      detalhe: `As imagens somam ${(bytes / MB).toFixed(1)} MB em base64; o limite por leitura é ${(cap.maxBytesBase64 / MB).toFixed(0)} MB.`,
    };
  }
  return { ok: true, bytesBase64: bytes, megapixelsMax };
}
