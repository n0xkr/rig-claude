import { randomUUID } from './uuid.js';
import { api } from '../lib/apiClient.js';
import {
  enqueueMutation,
  listQueuedMutations,
  removeMutation,
  updateMutationAttempt,
  type QueuedMutation,
} from './db.js';

const MAX_ATTEMPTS = 5;
let syncing = false;
const listeners = new Set<(pending: number) => void>();

export function onQueueChange(listener: (pending: number) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function notifyListeners(): Promise<void> {
  const pending = (await listQueuedMutations()).length;
  for (const listener of listeners) listener(pending);
}

/**
 * Enfileira a criação de uma viagem para envio posterior (usado quando o
 * dispositivo está offline ou a chamada de rede falha).
 */
export async function queueCreateViagem(payload: Record<string, unknown>): Promise<void> {
  await enqueueMutation({
    id: randomUUID(),
    kind: 'create-viagem',
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
  });
  await notifyListeners();
  void trySync();
}

export async function queueUpdateViagem(
  targetId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await enqueueMutation({
    id: randomUUID(),
    kind: 'update-viagem',
    payload,
    targetId,
    createdAt: new Date().toISOString(),
    attempts: 0,
  });
  await notifyListeners();
  void trySync();
}

/**
 * Enfileira o registro de uma etapa de travessia de fronteira (Módulo 2,
 * critério #2) para envio posterior, reaproveitando a mesma fila offline
 * usada pelo módulo de viagens.
 */
export async function queueCreateEventoFronteira(
  viagemId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await enqueueMutation({
    id: randomUUID(),
    kind: 'create-evento-fronteira',
    payload,
    targetId: viagemId,
    createdAt: new Date().toISOString(),
    attempts: 0,
  });
  await notifyListeners();
  void trySync();
}

/**
 * Enfileira a criação do frete contratado de uma viagem (Módulo 3, critério
 * #1 — "Frete contratado"), reaproveitando a mesma fila offline. Apenas o
 * registro do cabeçalho comercial é enfileirável: transições de fechamento,
 * lançamentos financeiros e pagamentos exigem validação de saldo/estado em
 * tempo real no servidor e por isso nunca são enfileirados (mesmo padrão do
 * Módulo 2, que só enfileira a criação de eventos de fronteira, nunca a
 * mudança de status da viagem).
 */
export async function queueCreateFrete(
  viagemId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await enqueueMutation({
    id: randomUUID(),
    kind: 'create-frete',
    payload,
    targetId: viagemId,
    createdAt: new Date().toISOString(),
    attempts: 0,
  });
  await notifyListeners();
  void trySync();
}

/** Enfileira a edição do cabeçalho comercial de um frete já existente. */
export async function queueUpdateFrete(
  freteId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await enqueueMutation({
    id: randomUUID(),
    kind: 'update-frete',
    payload,
    targetId: freteId,
    createdAt: new Date().toISOString(),
    attempts: 0,
  });
  await notifyListeners();
  void trySync();
}

async function sendMutation(mutation: QueuedMutation): Promise<void> {
  if (mutation.kind === 'create-viagem') {
    await api.post('/viagens', mutation.payload);
  } else if (mutation.kind === 'update-viagem' && mutation.targetId) {
    await api.patch(`/viagens/${mutation.targetId}`, mutation.payload);
  } else if (mutation.kind === 'create-evento-fronteira' && mutation.targetId) {
    await api.post(`/viagens/${mutation.targetId}/fronteira/eventos`, mutation.payload);
  } else if (mutation.kind === 'create-frete' && mutation.targetId) {
    await api.post(`/viagens/${mutation.targetId}/frete`, mutation.payload);
  } else if (mutation.kind === 'update-frete' && mutation.targetId) {
    await api.patch(`/fretes/${mutation.targetId}`, mutation.payload);
  }
}

/**
 * Percorre a fila IndexedDB e tenta reenviar cada mutação pendente à API.
 * Mutações que falharem MAX_ATTEMPTS vezes ficam retidas na fila para
 * inspeção manual (não são descartadas silenciosamente).
 */
export async function trySync(): Promise<void> {
  if (syncing || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
  syncing = true;
  try {
    const pending = await listQueuedMutations();
    for (const mutation of pending) {
      if (mutation.attempts >= MAX_ATTEMPTS) continue;
      try {
        await sendMutation(mutation);
        await removeMutation(mutation.id);
      } catch (error) {
        await updateMutationAttempt(
          mutation.id,
          error instanceof Error ? error.message : 'erro desconhecido',
        );
      }
    }
  } finally {
    syncing = false;
    await notifyListeners();
  }
}

export function startOfflineSync(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('online', () => void trySync());
  void trySync();
  // Revalida periodicamente (ex: SW ativo, mas evento 'online' perdido).
  setInterval(() => void trySync(), 30_000);
}
