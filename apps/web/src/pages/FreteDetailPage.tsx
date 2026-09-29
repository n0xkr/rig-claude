import { useParams } from 'react-router-dom';
import { FreteWorkflowView } from '../components/FreteWorkflowView.js';

/** Tela de detalhe/fechamento de um frete acessada diretamente por id (`/fretes/:id`), fora do contexto de uma viagem específica — usada pela visão financeira geral (`FretesListPage`). */
export default function FreteDetailPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <FreteWorkflowView freteId={id} />
    </div>
  );
}
