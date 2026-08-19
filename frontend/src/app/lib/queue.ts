import { api, getToken } from "@/shared/lib/api";
import { blobToBase64 } from "./recorder";

/**
 * Offline-first upload queue.
 *
 * The single most important thing in the field app. A rep records between
 * shops on a connection that drops constantly; a recording must never be lost
 * because the network was down, and he must never wait for an upload before
 * walking to the next outlet.
 *
 * Clips live in IndexedDB until the server has acknowledged them. The
 * client-generated `clientUuid` is the idempotency key, so retrying an upload
 * that actually succeeded is always safe.
 */
export interface QueuedClip {
  clientUuid: string;
  blob: Blob;
  mimeType: string;
  geo: { lat: number; lng: number } | null;
  declaredOutletId: string | null;
  recordedAt: string;
  durationSec: number;
  attempts: number;
  status: "pending" | "uploading" | "sent" | "failed";
  clipId?: string;
  error?: string;
}

const DB_NAME = "muse";
const STORE = "clips";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "clientUuid" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const store = db.transaction(STORE, mode).objectStore(STORE);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const clipQueue = {
  async add(clip: QueuedClip): Promise<void> {
    await tx("readwrite", (s) => s.put(clip));
  },
  async all(): Promise<QueuedClip[]> {
    const rows = await tx<QueuedClip[]>("readonly", (s) => s.getAll() as IDBRequest<QueuedClip[]>);
    return rows.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  },
  async update(clientUuid: string, patch: Partial<QueuedClip>): Promise<void> {
    const existing = await tx<QueuedClip | undefined>(
      "readonly", (s) => s.get(clientUuid) as IDBRequest<QueuedClip | undefined>,
    );
    if (!existing) return;
    await tx("readwrite", (s) => s.put({ ...existing, ...patch }));
  },
  async remove(clientUuid: string): Promise<void> {
    await tx("readwrite", (s) => s.delete(clientUuid) as unknown as IDBRequest<undefined>);
  },
  /** Sent clips are kept briefly so the rep can see them land, then pruned. */
  async prune(keepSent = 10): Promise<void> {
    const sent = (await clipQueue.all()).filter((c) => c.status === "sent");
    for (const c of sent.slice(keepSent)) await clipQueue.remove(c.clientUuid);
  },
};

let draining = false;

/**
 * Attempt every pending clip, oldest first.
 *
 * Backs off rather than hammering: a clip that has failed repeatedly is left
 * for a later pass instead of burning battery on a dead connection.
 */
export async function drainQueue(onChange?: () => void): Promise<void> {
  if (draining || !navigator.onLine || !getToken()) return;
  draining = true;

  try {
    const pending = (await clipQueue.all())
      .filter((c) => c.status === "pending" || c.status === "failed")
      .filter((c) => c.attempts < 6)
      .reverse();

    for (const clip of pending) {
      await clipQueue.update(clip.clientUuid, { status: "uploading" });
      onChange?.();

      try {
        const audioBase64 = await blobToBase64(clip.blob);
        const res = await api.post<{ clipId: string; status: string }>("/observations", {
          clientUuid: clip.clientUuid,
          audioBase64,
          mimeType: clip.mimeType,
          geo: clip.geo,
          declaredOutletId: clip.declaredOutletId,
          recordedAt: clip.recordedAt,
        });
        await clipQueue.update(clip.clientUuid, { status: "sent", clipId: res.clipId });
      } catch (err) {
        await clipQueue.update(clip.clientUuid, {
          status: "failed",
          attempts: clip.attempts + 1,
          error: err instanceof Error ? err.message : "upload failed",
        });
      }
      onChange?.();
    }

    await clipQueue.prune();
  } finally {
    draining = false;
    onChange?.();
  }
}
