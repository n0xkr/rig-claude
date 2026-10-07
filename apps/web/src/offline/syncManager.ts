import { randomUUID } from './uuid.js';
import { api, ApiError, getCurrentUserId } from '../lib/apiClient.js';
import {
  enqueueMutation,
  listQueuedMutations,
  removeMutation,
  marcarMutationFalha,
  reenfileirarMutation,
  updateMutationAttempt,
  type QueuedMutation,
} from './db.js';

const MAX_ATTEMPTS = 5;
let syncing = false;
export interface QueueStatus {
  pending: number;
  failed: number;
}
const listeners = new Set<(status: QueueStatus) => void>();

export function onQueueChange(listener: (status: QueueStatus) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function notifyListeners(): Promise<void> {
  const status = await statusDaFila();
  for (const listener of listeners) listener(status);
}

/** Operações do usuário atual: pendentes de envio e com erro (FAILED/CONFLICT ou tentativas esgotadas). */
export async function statusDaFila(): Promise<QueueStatus> {
  const uid = getCurrentUserId();
  const minhas = (await listQueuedMutations()).filter((m) => !m.userId || m.userId === uid);
  const failed = minhas.filter(
    (m) => m.status === 'FAILED' || m.status === 'CONFLICT' || m.attempts >= MAX_ATTEMPTS,
  );
  return { pending: minhas.length - failed.length, failed: failed.length };
}

/** Reenvia manualmente as operações com erro do usuário atual. */
export async function tentarNovamenteFalhas(): Promise<void> {
  const uid = getCurrentUserId();
  for (const m of await listQueuedMutations()) {
    if (m.userId && m.userId !== uid) continue;
    if (m.status === 'FAILED' || m.status === 'CONFLICT' || m.attempts >= MAX_ATTEMPTS) {
      await reenfileirarMutation(m.id);
    }
  }
  await trySync();
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

/**
 * Enfileira uma manutenção de veículo (Módulo 4, Controle de Frota) para
 * envio posterior.
 */
export async function queueCreateManutencaoVeiculo(
  payload: Record<string, unknown>,
): Promise<void> {
  await enqueueMutation({
    id: randomUUID(),
    kind: 'create-manutencao-veiculo',
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
  });
  await notifyListeners();
  void trySync();
}

/** Enfileira a atualização de quilometragem/consumo de uma viagem (colunas próprias do Módulo 4). */
export async function queueUpdateQuilometragemViagem(
  viagemId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await enqueueMutation({
    id: randomUUID(),
    kind: 'update-quilometragem-viagem',
    payload,
    targetId: viagemId,
    createdAt: new Date().toISOString(),
    attempts: 0,
  });
  await notifyListeners();
  void trySync();
}

/**
 * Enfileira o registro de um evento de jornada (Módulo 4, Controle de
 * Jornada — ADI 5322). Diferente de `create-frete`/`create-viagem`, este
 * evento tem um `timestamp_evento` que idealmente reflete o momento real do
 * acontecimento (ex: início de espera na fronteira sem sinal de rede) — por
 * isso o payload já inclui o timestamp capturado no momento do clique,
 * preenchido pelo formulário antes de enfileirar, não no momento da
 * sincronização.
 */
export async function queueCreateRegistroJornada(payload: Record<string, unknown>): Promise<void> {
  await enqueueMutation({
    id: randomUUID(),
    kind: 'create-registro-jornada',
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
  });
  await notifyListeners();
  void trySync();
}

/**
 * Enfileira o cadastro de um depositante (Módulo 5, WMS — Armazém Geral)
 * para envio posterior, reaproveitando a mesma fila offline dos demais
 * módulos (extensão, nunca uma fila paralela).
 */
export async function queueCreateDepositante(payload: Record<string, unknown>): Promise<void> {
  await enqueueMutation({
    id: randomUUID(),
    kind: 'create-depositante',
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
  });
  await notifyListeners();
  void trySync();
}

/** Enfileira o registro de uma avaria (Módulo 5, WMS — Controle de avarias) para envio posterior. */
export async function queueCreateAvaria(payload: Record<string, unknown>): Promise<void> {
  await enqueueMutation({
    id: randomUUID(),
    kind: 'create-avaria',
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
  });
  await notifyListeners();
  void trySync();
}

async function sendMutation(mutation: QueuedMutation): Promise<void> {
  if (mutation.kind === 'create-viagem') {
    await api.post('/viagens', mutation.payload, mutation.id);
  } else if (mutation.kind === 'update-viagem' && mutation.targetId) {
    await api.patch(`/viagens/${mutation.targetId}`, mutation.payload, mutation.id);
  } else if (mutation.kind === 'create-evento-fronteira' && mutation.targetId) {
    await api.post(`/viagens/${mutation.targetId}/fronteira/eventos`, mutation.payload, mutation.id);
  } else if (mutation.kind === 'create-frete' && mutation.targetId) {
    await api.post(`/viagens/${mutation.targetId}/frete`, mutation.payload, mutation.id);
  } else if (mutation.kind === 'update-frete' && mutation.targetId) {
    await api.patch(`/fretes/${mutation.targetId}`, mutation.payload, mutation.id);
  } else if (mutation.kind === 'create-manutencao-veiculo') {
    await api.post('/frota/manutencoes', mutation.payload, mutation.id);
  } else if (mutation.kind === 'update-quilometragem-viagem' && mutation.targetId) {
    await api.patch(`/frota/viagens/${mutation.targetId}/quilometragem`, mutation.payload, mutation.id);
  } else if (mutation.kind === 'create-registro-jornada') {
    await api.post('/jornada/eventos', mutation.payload, mutation.id);
  } else if (mutation.kind === 'create-depositante') {
    await api.post('/wms/depositantes', mutation.payload, mutation.id);
  } else if (mutation.kind === 'create-avaria') {
    await api.post('/wms/avarias', mutation.payload, mutation.id);
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
    // Eventos de jornada dependem da ordem (máquina de estados no servidor): se um falhar, os
    // seguintes do mesmo motorista esperam a próxima rodada em vez de serem rejeitados fora de ordem.
    const motoristasComFalha = new Set<string>();
    const uid = getCurrentUserId();
    if (!uid) return;
    for (const mutation of pending) {
      if (mutation.userId && mutation.userId !== uid) continue;
      if (mutation.status === 'FAILED' || mutation.status === 'CONFLICT') continue;
      if (mutation.attempts >= MAX_ATTEMPTS) continue;
      const motoristaId =
        mutation.kind === 'create-registro-jornada' ? String(mutation.payload.motorista_id) : null;
      if (motoristaId && motoristasComFalha.has(motoristaId)) continue;
      try {
        await sendMutation(mutation);
        await removeMutation(mutation.id);
      } catch (error) {
        if (motoristaId) motoristasComFalha.add(motoristaId);
        const http = error instanceof ApiError ? error.problem.status : 0;
        if (http === 409) {
          await marcarMutationFalha(mutation.id, 'CONFLICT', (error as Error).message);
          continue;
        }
        if (http >= 400 && http < 500 && http !== 401 && http !== 408 && http !== 429) {
          await marcarMutationFalha(mutation.id, 'FAILED', (error as Error).message);
          continue;
        }
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
