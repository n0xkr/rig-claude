import { useCallback, useEffect, useState } from 'react';
import { AVATAR_MAX_BYTES, type Perfil, type UpdatePerfilInput } from '@rigabras/shared';
import { api, ApiError } from '../lib/apiClient.js';

export const PERFIL_ATUALIZADO_EVENT = 'rigabras:perfil-atualizado';

function mensagemErro(err: unknown): string {
  return err instanceof ApiError ? (err.problem.detail ?? err.problem.title) : 'Erro inesperado';
}

/** Perfil do usuário logado (Painel do usuário): carrega e salva via `/perfil`. */
export function usePerfil() {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setPerfil(await api.get<Perfil>('/perfil'));
    } catch (err) {
      setErro(mensagemErro(err));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const salvar = useCallback(async (input: UpdatePerfilInput): Promise<Perfil | undefined> => {
    setSalvando(true);
    setErro(null);
    try {
      const atualizado = await api.patch<Perfil>('/perfil', input);
      setPerfil(atualizado);
      window.dispatchEvent(new CustomEvent(PERFIL_ATUALIZADO_EVENT, { detail: atualizado }));
      return atualizado;
    } catch (err) {
      setErro(mensagemErro(err));
      return undefined;
    } finally {
      setSalvando(false);
    }
  }, []);

  return { perfil, carregando, salvando, erro, salvar, recarregar };
}

const AVATAR_SIZE = 256;

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

/**
 * Redimensiona a imagem no navegador para um avatar quadrado 256x256 (recorte central "cover")
 * e devolve um data URL JPEG com tamanho aproximado <= AVATAR_MAX_BYTES.
 */
export async function reduzirImagemParaAvatar(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('O arquivo selecionado não é uma imagem.');
  }
  const img = await carregarImagem(file);
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Seu navegador não suporta o processamento de imagens.');

  const lado = Math.min(img.naturalWidth, img.naturalHeight);
  if (!lado) throw new Error('Imagem inválida.');
  const sx = (img.naturalWidth - lado) / 2;
  const sy = (img.naturalHeight - lado) / 2;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
  ctx.drawImage(img, sx, sy, lado, lado, 0, 0, AVATAR_SIZE, AVATAR_SIZE);

  // Tamanho aproximado dos bytes reais: base64 => 3/4 do comprimento da parte codificada.
  const bytes = (url: string) => Math.round(((url.length - url.indexOf(',') - 1) * 3) / 4);
  let qualidade = 0.85;
  let dataUrl = canvas.toDataURL('image/jpeg', qualidade);
  while (bytes(dataUrl) > AVATAR_MAX_BYTES && qualidade > 0.3) {
    qualidade = Math.round((qualidade - 0.1) * 100) / 100;
    dataUrl = canvas.toDataURL('image/jpeg', qualidade);
  }
  if (bytes(dataUrl) > AVATAR_MAX_BYTES) {
    throw new Error('Não foi possível reduzir a imagem o bastante. Escolha outra foto.');
  }
  return dataUrl;
}
