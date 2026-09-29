import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import type { TipoExpedicao } from '@rigabras/shared';
import { useCreateExpedicao } from '../hooks/useExpedicoes.js';
import { useDepositantesList } from '../hooks/useDepositantes.js';
import { useProdutosList } from '../hooks/useProdutosArmazenados.js';

/** Formulário de solicitação de expedição (Módulo 5, WMS): normal ou cross-docking. */
export default function ExpedicaoFormPage() {
  const navigate = useNavigate();
  const { create, submitting, error } = useCreateExpedicao();
  const { depositantes } = useDepositantesList();
  const [depositanteId, setDepositanteId] = useState('');
  const { produtos } = useProdutosList(depositanteId || undefined);
  const [referencia, setReferencia] = useState('');
  const [tipo, setTipo] = useState<TipoExpedicao>('NORMAL');
  const [itens, setItens] = useState<Array<{ produto_id: string; quantidade_solicitada: string }>>([
    { produto_id: '', quantidade_solicitada: '' },
  ]);

  function addItem() {
    setItens((prev) => [...prev, { produto_id: '', quantidade_solicitada: '' }]);
  }
  function removeItem(index: number) {
    setItens((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const created = await create({
      depositante_id: depositanteId,
      referencia_documento: referencia || undefined,
      tipo,
      itens: itens
        .filter((i) => i.produto_id && i.quantidade_solicitada)
        .map((i) => ({
          produto_id: i.produto_id,
          quantidade_solicitada: Number(i.quantidade_solicitada),
        })),
    });
    if (created) navigate(`/wms/expedicoes/${created.id}`);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link
        to="/wms/expedicoes"
        className="mb-4 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para expedições
      </Link>
      <h1 className="mb-6 text-2xl font-bold text-white">Nova expedição</h1>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-slate-800 p-6">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-300">Depositante *</span>
          <select
            required
            className="input"
            value={depositanteId}
            onChange={(e) => {
              setDepositanteId(e.target.value);
              setItens([{ produto_id: '', quantidade_solicitada: '' }]);
            }}
          >
            <option value="">Selecione...</option>
            {depositantes.map((d) => (
              <option key={d.id} value={d.id}>
                {d.razao_social}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-300">
              Referência do documento
            </span>
            <input
              className="input"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-300">Tipo</span>
            <select
              className="input"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoExpedicao)}
            >
              <option value="NORMAL">Normal</option>
              <option value="CROSS_DOCKING">Cross-docking</option>
            </select>
          </label>
        </div>

        <div>
          <span className="mb-2 block text-sm font-medium text-slate-300">Itens solicitados *</span>
          <div className="space-y-2">
            {itens.map((item, index) => (
              <div key={index} className="flex gap-2">
                <select
                  required
                  className="input flex-1"
                  value={item.produto_id}
                  onChange={(e) =>
                    setItens((prev) =>
                      prev.map((it, i) =>
                        i === index ? { ...it, produto_id: e.target.value } : it,
                      ),
                    )
                  }
                >
                  <option value="">Produto...</option>
                  {produtos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} — {p.descricao}
                    </option>
                  ))}
                </select>
                <input
                  required
                  type="number"
                  min={0}
                  step="0.001"
                  placeholder="Qtd."
                  className="input w-28"
                  value={item.quantidade_solicitada}
                  onChange={(e) =>
                    setItens((prev) =>
                      prev.map((it, i) =>
                        i === index ? { ...it, quantidade_solicitada: e.target.value } : it,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  className="rounded-md border border-slate-700 px-2 text-slate-400 hover:text-red-400"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addItem}
            className="mt-2 flex items-center gap-1 text-sm text-slate-400 hover:text-white"
          >
            <Plus className="h-4 w-4" /> Adicionar item
          </button>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-rigabras-500 px-4 py-2 font-medium text-white hover:bg-blue-600 disabled:opacity-50"
        >
          {submitting ? 'Salvando...' : 'Solicitar expedição'}
        </button>
      </form>
    </div>
  );
}
