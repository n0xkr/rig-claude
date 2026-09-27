import { randomUUID } from "./uuid.js";
import { api } from "../lib/apiClient.js";
import {
  enqueueMutation,
  listQueuedMutations,
  removeMutation,
  updateMutationAttempt,
  type QueuedMutation,
} from "./db.js";

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
    kind: "create-viagem",
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
  });
  await notifyListeners();
  void trySync();
}

export async function queueUpdateViagem(targetId: string, payload: Record<string, unknown>): Promise<void> {
  await enqueueMutation({
    id: randomUUID(),
    kind: "update-viagem",
    payload,
    targetId,
    createdAt: new Date().toISOString(),
    attempts: 0,
  });
  await notifyListeners();
  void trySync();
}

async function sendMutation(mutation: QueuedMutation): Promise<void> {
  if (mutation.kind === "create-viagem") {
    await api.post("/viagens", mutation.payload);
  } else if (mutation.kind === "update-viagem" && mutation.targetId) {
    await api.patch(`/viagens/${mutation.targetId}`, mutation.payload);
  }
}

/**
 * Percorre a fila IndexedDB e tenta reenviar cada mutação pendente à API.
 * Mutações que falharem MAX_ATTEMPTS vezes ficam retidas na fila para
 * inspeção manual (não são descartadas silenciosamente).
 */
export async function trySync(): Promise<void> {
  if (syncing || typeof navigator !== "undefined" && !navigator.onLine) return;
  syncing = true;
  try {
    const pending = await listQueuedMutations();
    for (const mutation of pending) {
      if (mutation.attempts >= MAX_ATTEMPTS) continue;
      try {
        await sendMutation(mutation);
        await removeMutation(mutation.id);
      } catch (error) {
        await updateMutationAttempt(mutation.id, error instanceof Error ? error.message : "erro desconhecido");
      }
    }
  } finally {
    syncing = false;
    await notifyListeners();
  }
}

export function startOfflineSync(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("online", () => void trySync());
  void trySync();
  // Revalida periodicamente (ex: SW ativo, mas evento 'online' perdido).
  setInterval(() => void trySync(), 30_000);
}
