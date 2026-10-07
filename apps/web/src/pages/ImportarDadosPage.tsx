import { Sparkles } from 'lucide-react';
import { ImportacaoInteligente } from '../components/ImportacaoInteligente.js';

/**
 * Importar dados: o usuário só envia as planilhas/documentos. Não existe mais
 * mapeamento manual de colunas — ver `ImportacaoInteligente`.
 */
export default function ImportarDadosPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="mb-2 flex items-center gap-2 text-2xl font-bold text-slate-900">
        <Sparkles className="h-6 w-6 text-blue-600" /> Importar dados
      </h1>
      <p className="mb-6 text-sm text-slate-500">
        Envie as planilhas da operação (viagens, frota, motoristas, clientes, CRT/DANFE, checklists, SMP, consultas).
        O sistema entende cada aba sozinho, cruza as informações entre elas e com o que já está cadastrado, e grava
        tudo consolidado. Reimportar a mesma planilha atualiza os registros — não duplica. Depois, tudo pode ser editado
        normalmente no sistema.
      </p>
      <ImportacaoInteligente />
    </div>
  );
}
