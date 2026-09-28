import { useState } from 'react';
import { Bot, Send, User } from 'lucide-react';
import { useChatbot } from '../hooks/useChatbot.js';

interface Mensagem {
  autor: 'usuario' | 'ia';
  texto: string;
  fontesDados?: string[];
  geradoEm?: string;
}

const SUGESTOES = [
  'Quantos veículos estão aguardando descarga?',
  'Qual veículo está há mais tempo no pátio?',
  'Quantas viagens estão em andamento?',
  'Quanto de frete está pendente de aprovação?',
  'Qual a ocupação do armazém?',
  'Quais motoristas têm alertas de jornada?',
];

/** RIGABRAS AI (Módulo 10) — assistente operacional conversacional, respostas sempre baseadas em dados reais consultados na hora. */
export default function RigabrasAiPage() {
  const { perguntar, enviando, error } = useChatbot();
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [pergunta, setPergunta] = useState('');

  async function enviar(texto: string) {
    if (!texto.trim() || enviando) return;
    setMensagens((prev) => [...prev, { autor: 'usuario', texto }]);
    setPergunta('');
    try {
      const resultado = await perguntar(texto);
      setMensagens((prev) => [
        ...prev,
        {
          autor: 'ia',
          texto: resultado.resposta,
          fontesDados: resultado.fontesDados,
          geradoEm: resultado.geradoEm,
        },
      ]);
    } catch {
      setMensagens((prev) => [
        ...prev,
        { autor: 'ia', texto: 'Não foi possível processar a pergunta agora. Tente novamente.' },
      ]);
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col px-4 py-8" style={{ minHeight: '70vh' }}>
      <div className="mb-4 flex items-center gap-2">
        <Bot className="h-6 w-6 text-rigabras-500" />
        <h1 className="text-2xl font-bold text-white">RIGABRAS AI</h1>
      </div>
      <p className="mb-6 text-sm text-slate-400">
        Assistente operacional: responde só com dados reais consultados ao vivo no sistema — nunca
        inventa números.
      </p>

      {mensagens.length === 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {SUGESTOES.map((s) => (
            <button
              key={s}
              onClick={() => enviar(s)}
              className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="mb-4 flex-1 space-y-4 overflow-y-auto">
        {mensagens.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.autor === 'usuario' ? 'justify-end' : ''}`}>
            {m.autor === 'ia' && (
              <Bot className="mt-1 h-5 w-5 shrink-0 text-rigabras-500" />
            )}
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
                m.autor === 'usuario'
                  ? 'bg-rigabras-500 text-white'
                  : 'border border-slate-800 bg-slate-900/60 text-slate-200'
              }`}
            >
              <p className="whitespace-pre-wrap">{m.texto}</p>
              {m.fontesDados && (
                <p className="mt-2 text-[11px] text-slate-500">
                  Fontes: {m.fontesDados.join(', ')}
                  {m.geradoEm && ` · ${new Date(m.geradoEm).toLocaleString('pt-BR')}`}
                </p>
              )}
            </div>
            {m.autor === 'usuario' && <User className="mt-1 h-5 w-5 shrink-0 text-slate-400" />}
          </div>
        ))}
        {enviando && <p className="text-sm text-slate-500">Consultando os dados...</p>}
      </div>

      {error && <p className="mb-2 text-sm text-red-400">{error}</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void enviar(pergunta);
        }}
        className="flex gap-2"
      >
        <input
          className="input flex-1"
          placeholder="Pergunte sobre a operação..."
          value={pergunta}
          onChange={(e) => setPergunta(e.target.value)}
          disabled={enviando}
        />
        <button
          type="submit"
          disabled={enviando || !pergunta.trim()}
          className="rounded-md bg-rigabras-500 px-4 py-2 text-white hover:bg-blue-600 disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
