import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

/**
 * Fila offline (offline-first) para operações de criação/atualização de
 * viagens no módulo de Gerenciamento de Risco. Enquanto o dispositivo está
 * sem conectividade, os formulários gravam aqui; um SyncManager tenta
 * reenviar para a API sempre que a conexão volta.
 */
export interface QueuedMutation {
  id: string; // uuid gerado no cliente, dobra como chave de idempotência
  kind: 'create-viagem' | 'update-viagem';
  payload: Record<string, unknown>;
  targetId?: string; // usado em update-viagem
  createdAt: string;
  attempts: number;
  lastError?: string;
}

interface RigabrasOfflineDB extends DBSchema {
  mutationQueue: {
    key: string;
    value: QueuedMutation;
    indexes: { 'by-createdAt': string };
  };
}

let dbPromise: Promise<IDBPDatabase<RigabrasOfflineDB>> | null = null;

export function getOfflineDb(): Promise<IDBPDatabase<RigabrasOfflineDB>> {
  if (!dbPromise) {
    dbPromise = openDB<RigabrasOfflineDB>('rigabras-offline', 1, {
      upgrade(db) {
        const store = db.createObjectStore('mutationQueue', { keyPath: 'id' });
        store.createIndex('by-createdAt', 'createdAt');
      },
    });
  }
  return dbPromise;
}

export async function enqueueMutation(mutation: QueuedMutation): Promise<void> {
  const db = await getOfflineDb();
  await db.put('mutationQueue', mutation);
}

export async function listQueuedMutations(): Promise<QueuedMutation[]> {
  const db = await getOfflineDb();
  return db.getAllFromIndex('mutationQueue', 'by-createdAt');
}

export async function removeMutation(id: string): Promise<void> {
  const db = await getOfflineDb();
  await db.delete('mutationQueue', id);
}

export async function updateMutationAttempt(id: string, error: string): Promise<void> {
  const db = await getOfflineDb();
  const existing = await db.get('mutationQueue', id);
  if (!existing) return;
  existing.attempts += 1;
  existing.lastError = error;
  await db.put('mutationQueue', existing);
}
