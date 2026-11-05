// Tiny IndexedDB store so an in-progress edit survives the Stripe redirect.
const DB = 'mie-draft';
const STORE = 'kv';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export type EditDraft = {
  image: Blob;
  imageName: string;
  markup: Blob | null;
  instruction: string;
  model: string;
  quality: string;
  savedAt: number;
};

export async function saveDraft(d: EditDraft) {
  try {
    const db = await open();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(d, 'draft');
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } catch {
    /* ignore */
  }
}

export async function loadDraft(): Promise<EditDraft | null> {
  try {
    const db = await open();
    return await new Promise((res) => {
      const tx = db.transaction(STORE, 'readonly');
      const r = tx.objectStore(STORE).get('draft');
      r.onsuccess = () => res((r.result as EditDraft) || null);
      r.onerror = () => res(null);
    });
  } catch {
    return null;
  }
}

export async function clearDraft() {
  try {
    const db = await open();
    db.transaction(STORE, 'readwrite').objectStore(STORE).delete('draft');
  } catch {
    /* ignore */
  }
}
