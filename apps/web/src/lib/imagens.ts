/**
 * Redimensiona uma imagem no navegador e devolve um data URL JPEG dentro de
 * `maxBytes` (mesma estratégia de qualidade progressiva do avatar). Usado nas
 * fotos opcionais da solicitação de manutenção, onde o arquivo vai no corpo do
 * JSON (por isso o limite por imagem).
 */
export async function reduzirImagem(
  file: File,
  { larguraMax, alturaMax, maxBytes }: { larguraMax: number; alturaMax: number; maxBytes: number },
): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('O arquivo selecionado não é uma imagem.');
  }
  const img = await carregarImagem(file);
  const proporcao = Math.min(larguraMax / img.naturalWidth, alturaMax / img.naturalHeight, 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * proporcao));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * proporcao));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Seu navegador não suporta o processamento de imagens.');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  // Tamanho aproximado dos bytes reais: base64 => 3/4 do comprimento da parte codificada.
  const bytes = (url: string) => Math.round(((url.length - url.indexOf(',') - 1) * 3) / 4);
  let qualidade = 0.85;
  let dataUrl = canvas.toDataURL('image/jpeg', qualidade);
  while (bytes(dataUrl) > maxBytes && qualidade > 0.3) {
    qualidade = Math.round((qualidade - 0.1) * 100) / 100;
    dataUrl = canvas.toDataURL('image/jpeg', qualidade);
  }
  if (bytes(dataUrl) > maxBytes) {
    throw new Error('Não foi possível reduzir a imagem o bastante. Escolha outra foto.');
  }
  return dataUrl;
}

function carregarImagem(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não foi possível ler a imagem. Tente outro arquivo.'));
    };
    img.src = url;
  });
}
