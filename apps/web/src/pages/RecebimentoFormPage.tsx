import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { useCreateRecebimento } from '../hooks/useRecebimentos.js';
import { useDepositantesList } from '../hooks/useDepositantes.js';
import { useProdutosList } from '../hooks/useProdutosArmazenados.js';

/** Formulário de registro da expectativa de recebimento (Módulo 5, WMS — Recebimento e Conferência). */
export default function RecebimentoFormPage() {
  const navigate = useNavigate();
  const { create, submitting, error } = useCreateRecebimento();
  const { depositantes } = useDepositantesList();
  const [depositanteId, setDepositanteId] = useState('');
  const { produtos } = useProdutosList(depositanteId || undefined);
  const [referencia, setReferencia] = useState('');
  const [dataPrevista, setDataPrevista] = useState('');
  const [itens, setItens] = useState<Array<{ produto_id: string; quantidade_esperada: string }>>([
    { produto_id: '', quantidade_esperada: '' },
  ]);

  function addItem() {
    setItens((prev) => [...prev, { produto_id: '', quantidade_esperada: '' }]);
  }
  function removeItem(index: number) {
    setItens((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const created = await create({
      depositante_id: depositanteId,
      referencia_documento: referencia || undefined,
      data_prevista: dataPrevista || undefined,
      itens: itens
        .filter((i) => i.produto_id && i.quantidade_esperada)
        .map((i) => ({
          produto_id: i.produto_id,
          quantidade_esperada: Number(i.quantidade_esperada),
        })),
    });
    if (created) navigate(`/wms/recebimentos/${created.id}`);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link
        to="/wms/recebimentos"
        className="mb-4 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar para recebimentos
      </Link>
      <h1 className="mb-6 text-2xl font-bold text-white">Novo recebimento</h1>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-slate-800 p-6">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-300">Depositante *</span>
          <select
            required
            className="input"
            value={depositanteId}
            onChange={(e) => {
              setDepositanteId(e.target.value);
              setItens([{ produto_id: '', quantidade_esperada: '' }]);
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
            <span className="mb-1 block text-sm font-medium text-slate-300">Data prevista</span>
            <input
              type="date"
              className="input"
              value={dataPrevista}
              onChange={(e) => setDataPrevista(e.target.value)}
            />
          </label>
        </div>

        <div>
          <span className="mb-2 block text-sm font-medium text-slate-300">Itens esperados *</span>
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
                  value={item.quantidade_esperada}
                  onChange={(e) =>
                    setItens((prev) =>
                      prev.map((it, i) =>
                        i === index ? { ...it, quantidade_esperada: e.target.value } : it,
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
          {submitting ? 'Salvando...' : 'Registrar recebimento'}
        </button>
      </form>
    </div>
  );
}
