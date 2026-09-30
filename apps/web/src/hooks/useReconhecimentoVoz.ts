import { useCallback, useEffect, useRef, useState } from 'react';

// Tipos mínimos da Web Speech API (não fazem parte do lib.dom do TypeScript).
interface AlternativaReconhecimento {
  transcript: string;
}
interface ResultadoReconhecimento {
  readonly isFinal: boolean;
  readonly length: number;
  [indice: number]: AlternativaReconhecimento;
}
interface EventoResultadoReconhecimento {
  readonly resultIndex: number;
  readonly results: { readonly length: number; [indice: number]: ResultadoReconhecimento };
}
interface EventoErroReconhecimento {
  readonly error: string;
}
interface ReconhecimentoFala {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: EventoResultadoReconhecimento) => void) | null;
  onerror: ((e: EventoErroReconhecimento) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type ConstrutorReconhecimento = new () => ReconhecimentoFala;

function obterConstrutor(): ConstrutorReconhecimento | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: ConstrutorReconhecimento;
    webkitSpeechRecognition?: ConstrutorReconhecimento;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const MENSAGENS_ERRO: Record<string, string> = {
  'not-allowed': 'Permissão do microfone negada. Libere o acesso no navegador.',
  'service-not-allowed': 'Permissão do microfone negada. Libere o acesso no navegador.',
  'no-speech': 'Nenhuma fala detectada. Tente novamente.',
  'audio-capture': 'Microfone não encontrado.',
  network: 'Falha de rede no reconhecimento de voz.',
};

interface Opcoes {
  /** Chamado com o texto reconhecido (parcial enquanto fala, final ao terminar). */
  aoTranscrever: (texto: string, final: boolean) => void;
  idioma?: string;
}

/** Reconhecimento de voz via Web Speech API (pt-BR por padrão). Para sozinho ao desmontar. */
export function useReconhecimentoVoz({ aoTranscrever, idioma = 'pt-BR' }: Opcoes) {
  const suportado = obterConstrutor() !== null;
  const [ouvindo, setOuvindo] = useState(false);
  const [erroVoz, setErroVoz] = useState<string | null>(null);
  const reconhecimentoRef = useRef<ReconhecimentoFala | null>(null);
  const callbackRef = useRef(aoTranscrever);
  callbackRef.current = aoTranscrever;

  const parar = useCallback(() => {
    reconhecimentoRef.current?.stop();
  }, []);

  const iniciar = useCallback(() => {
    const Construtor = obterConstrutor();
    if (!Construtor || reconhecimentoRef.current) return;
    const reconhecimento = new Construtor();
    reconhecimento.lang = idioma;
    reconhecimento.interimResults = true;
    reconhecimento.continuous = false;

    reconhecimento.onresult = (e) => {
      let texto = '';
      let final = true;
      for (let i = 0; i < e.results.length; i++) {
        const resultado = e.results[i]!;
        texto += resultado[0]?.transcript ?? '';
        if (!resultado.isFinal) final = false;
      }
      callbackRef.current(texto.trim(), final);
    };
    reconhecimento.onerror = (e) => {
      if (e.error === 'aborted') return;
      setErroVoz(MENSAGENS_ERRO[e.error] ?? 'Não foi possível usar o reconhecimento de voz.');
    };
    reconhecimento.onend = () => {
      reconhecimentoRef.current = null;
      setOuvindo(false);
    };

    setErroVoz(null);
    reconhecimentoRef.current = reconhecimento;
    try {
      reconhecimento.start();
      setOuvindo(true);
    } catch {
      reconhecimentoRef.current = null;
      setErroVoz('Não foi possível iniciar o reconhecimento de voz.');
    }
  }, [idioma]);

  const alternar = useCallback(() => {
    if (reconhecimentoRef.current) parar();
    else iniciar();
  }, [iniciar, parar]);

  useEffect(
    () => () => {
      const r = reconhecimentoRef.current;
      if (r) {
        r.onresult = null;
        r.onerror = null;
        r.onend = null;
        r.abort();
        reconhecimentoRef.current = null;
      }
    },
    [],
  );

  return { suportado, ouvindo, erroVoz, iniciar, parar, alternar };
}
