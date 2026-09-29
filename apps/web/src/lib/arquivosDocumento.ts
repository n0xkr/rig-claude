import type { ArquivoBase64 } from '@rigabras/shared';

/**
 * Preparação de fotos/PDFs de documentos (CNH, CRLV) no navegador:
 * - para o OCR, tudo vira JPEG reduzido (o modelo de visão só lê imagens e
 *   fotos de celular passam de 5 MB); PDF vira uma imagem por página;
 * - para guardar, o arquivo original vai como está (PDF inteiro, foto reduzida).
 */

const MAX_LADO = 1800;
const MAX_ARQUIVO = 10 * 1024 * 1024;

function lerComoDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

const semPrefixo = (dataUrl: string) => dataUrl.slice(dataUrl.indexOf(',') + 1);

async function imagemParaJpeg(file: Blob): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, MAX_LADO / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch {
    return null; // formato que o navegador não decodifica (ex.: HEIC fora do Safari)
  }
}

async function pdfParaJpegs(file: File, maxPaginas: number): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const out: string[] = [];
  for (let p = 1; p <= Math.min(pdf.numPages, maxPaginas); p++) {
    const page = await pdf.getPage(p);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(2.5, MAX_LADO / Math.max(base.width, base.height)) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise;
    out.push(canvas.toDataURL('image/jpeg', 0.85));
  }
  return out;
}

/** Até 3 imagens JPEG (base64) prontas para o OCR, a partir de fotos e/ou PDFs. */
export async function imagensParaOcr(files: File[]): Promise<ArquivoBase64[]> {
  const out: ArquivoBase64[] = [];
  for (const f of files) {
    if (out.length >= 3) break;
    if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
      const paginas = await pdfParaJpegs(f, 3 - out.length);
      paginas.forEach((d, i) => out.push({ nome: `${f.name}#${i + 1}.jpg`, mime: 'image/jpeg', base64: semPrefixo(d) }));
    } else {
      const d = await imagemParaJpeg(f);
      if (d) out.push({ nome: f.name, mime: 'image/jpeg', base64: semPrefixo(d) });
    }
  }
  return out;
}

/** Arquivos para guardar no cadastro (PDF original; fotos reduzidas). */
export async function arquivosParaGuardar(files: File[]): Promise<ArquivoBase64[]> {
  const out: ArquivoBase64[] = [];
  for (const f of files.slice(0, 3)) {
    if (f.size > MAX_ARQUIVO) throw new Error(`${f.name} passa de 10 MB.`);
    if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
      out.push({ nome: f.name, mime: 'application/pdf', base64: semPrefixo(await lerComoDataUrl(f)) });
      continue;
    }
    const d = await imagemParaJpeg(f);
    if (d) out.push({ nome: f.name.replace(/\.\w+$/, '.jpg'), mime: 'image/jpeg', base64: semPrefixo(d) });
    else {
      const mime = (['image/png', 'image/webp', 'image/heic', 'image/heif'].includes(f.type) ? f.type : 'image/jpeg') as ArquivoBase64['mime'];
      out.push({ nome: f.name, mime, base64: semPrefixo(await lerComoDataUrl(f)) });
    }
  }
  return out;
}
