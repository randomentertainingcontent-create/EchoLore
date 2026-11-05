"use client";

/**
 * EchoLore's storage: everything lives in this browser's IndexedDB.
 * No server database, no accounts. Worlds, story messages (with their memory
 * embeddings) and lorebooks never leave the device except as the context sent
 * to the model for a reply.
 */
import type { Campaign, Message, MessageRole } from "@/types/echolore";

const DB_NAME = "echolore";
const DB_VERSION = 1;

export interface StoredCampaign extends Campaign {
  worldState: Record<string, unknown>;
  worldStateUpdatedAt: string;
}

export interface StoredMessage extends Message {
  /** Memory vector for semantic recall (null if embedding failed). */
  embedding: number[] | null;
}

export interface Backup {
  app: "echolore";
  version: 1;
  exportedAt: string;
  campaigns: StoredCampaign[];
  messages: StoredMessage[];
}

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("This browser can’t store worlds (IndexedDB is unavailable). Try a different browser or turn off private mode.")); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("campaigns")) db.createObjectStore("campaigns", { keyPath: "id" });
      if (!db.objectStoreNames.contains("messages")) {
        const store = db.createObjectStore("messages", { keyPath: "id" });
        store.createIndex("campaignId", "campaignId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open storage"));
    request.onblocked = () => reject(new Error("Storage is busy in another tab. Close other EchoLore tabs and reload."));
  }).catch((error) => { opening = null; throw error; });
  return opening;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Storage write failed"));
    tx.onabort = () => {
      const error = tx.error;
      reject(error?.name === "QuotaExceededError" ? new Error("This browser is out of storage space for EchoLore.") : error ?? new Error("Storage write was cancelled"));
    };
  });
}

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Storage read failed"));
  });
}

const byTime = (a: { createdAt: string; id: string }, b: { createdAt: string; id: string }) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

export const localDb = {
  async listCampaigns(): Promise<StoredCampaign[]> {
    const db = await open();
    const all = await result(db.transaction("campaigns").objectStore("campaigns").getAll() as IDBRequest<StoredCampaign[]>);
    return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },

  async getCampaign(id: string): Promise<StoredCampaign | null> {
    const db = await open();
    return (await result(db.transaction("campaigns").objectStore("campaigns").get(id) as IDBRequest<StoredCampaign | undefined>)) ?? null;
  },

  async putCampaign(campaign: StoredCampaign): Promise<void> {
    const db = await open();
    const tx = db.transaction("campaigns", "readwrite");
    tx.objectStore("campaigns").put(campaign);
    await done(tx);
  },

  async deleteCampaign(id: string): Promise<void> {
    const db = await open();
    const tx = db.transaction(["campaigns", "messages"], "readwrite");
    tx.objectStore("campaigns").delete(id);
    const index = tx.objectStore("messages").index("campaignId");
    const cursorRequest = index.openKeyCursor(IDBKeyRange.only(id));
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      tx.objectStore("messages").delete(cursor.primaryKey);
      cursor.continue();
    };
    await done(tx);
  },

  async listMessages(campaignId: string): Promise<StoredMessage[]> {
    const db = await open();
    const all = await result(db.transaction("messages").objectStore("messages").index("campaignId").getAll(IDBKeyRange.only(campaignId)) as IDBRequest<StoredMessage[]>);
    return all.sort(byTime);
  },

  async putMessages(messages: StoredMessage[]): Promise<void> {
    if (!messages.length) return;
    const db = await open();
    const tx = db.transaction("messages", "readwrite");
    const store = tx.objectStore("messages");
    for (const message of messages) store.put(message);
    await done(tx);
  },

  async deleteMessages(ids: string[]): Promise<void> {
    if (!ids.length) return;
    const db = await open();
    const tx = db.transaction("messages", "readwrite");
    const store = tx.objectStore("messages");
    for (const id of ids) store.delete(id);
    await done(tx);
  },

  async exportAll(): Promise<Backup> {
    const db = await open();
    const tx = db.transaction(["campaigns", "messages"]);
    const [campaigns, messages] = await Promise.all([
      result(tx.objectStore("campaigns").getAll() as IDBRequest<StoredCampaign[]>),
      result(tx.objectStore("messages").getAll() as IDBRequest<StoredMessage[]>),
    ]);
    return { app: "echolore", version: 1, exportedAt: new Date().toISOString(), campaigns, messages };
  },

  /** Merge a backup in. Records with the same id are replaced. */
  async importAll(backup: Backup): Promise<{ campaigns: number; messages: number }> {
    const db = await open();
    const tx = db.transaction(["campaigns", "messages"], "readwrite");
    for (const campaign of backup.campaigns) tx.objectStore("campaigns").put(campaign);
    for (const message of backup.messages) tx.objectStore("messages").put(message);
    await done(tx);
    return { campaigns: backup.campaigns.length, messages: backup.messages.length };
  },

  async clearAll(): Promise<void> {
    const db = await open();
    const tx = db.transaction(["campaigns", "messages"], "readwrite");
    tx.objectStore("campaigns").clear();
    tx.objectStore("messages").clear();
    await done(tx);
  },
};

const ROLES: MessageRole[] = ["user", "assistant", "system"];
const str = (value: unknown, max: number) => typeof value === "string" && value.trim().length > 0 && value.length <= max;

/** Validate an uploaded backup file before it touches storage. */
export function parseBackup(raw: unknown): Backup {
  const data = raw as Partial<Backup> | null;
  if (!data || data.app !== "echolore" || !Array.isArray(data.campaigns) || !Array.isArray(data.messages)) {
    throw new Error("That file isn’t an EchoLore backup.");
  }
  const campaigns = data.campaigns.filter((c): c is StoredCampaign => Boolean(c) && str(c.id, 100) && str(c.title, 120) && str(c.worldDescription, 8000)
    && str(c.userPersona, 4000) && str(c.aiPersona, 4000) && typeof c.createdAt === "string" && typeof c.updatedAt === "string")
    .map((c) => ({ ...c, worldState: c.worldState && typeof c.worldState === "object" && !Array.isArray(c.worldState) ? c.worldState : {}, worldStateUpdatedAt: typeof c.worldStateUpdatedAt === "string" ? c.worldStateUpdatedAt : c.updatedAt }));
  const ids = new Set(campaigns.map((c) => c.id));
  const messages = data.messages.filter((m): m is StoredMessage => Boolean(m) && str(m.id, 100) && ids.has(m.campaignId) && ROLES.includes(m.role) && str(m.content, 16000) && typeof m.createdAt === "string")
    .map((m) => ({ ...m, embedding: Array.isArray(m.embedding) && m.embedding.every((n) => Number.isFinite(n)) ? m.embedding : null }));
  if (!campaigns.length) throw new Error("That backup doesn’t contain any worlds.");
  return { app: "echolore", version: 1, exportedAt: typeof data.exportedAt === "string" ? data.exportedAt : new Date().toISOString(), campaigns, messages };
}

/** Cosine similarity for local memory search. */
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Top-k most similar stored messages, skipping ones already in working memory. */
export function recall(query: number[], messages: StoredMessage[], exclude: Set<string>, k = 5) {
  return messages
    .filter((m) => m.embedding && !exclude.has(m.id))
    .map((m) => ({ message: m, similarity: cosine(query, m.embedding!) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, k);
}
