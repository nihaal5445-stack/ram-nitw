/** Minimal IndexedDB helper (browser only). One DB, three stores shared by the phone and the scanner. */
const DB_NAME = "ram-access";
export type StoreName = "kv" | "outbox" | "ledger";

let dbPromise: Promise<IDBDatabase> | null = null;
function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore("kv");                         // key -> value (device key, wrapped bundle, ...)
      db.createObjectStore("outbox", { keyPath: "id" });  // scans waiting to sync
      db.createObjectStore("ledger", { keyPath: "key" }); // one admission per student/date/slot
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { dbPromise = null; reject(req.error); };
  });
  return dbPromise;
}

function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const req = fn(db.transaction(store, mode).objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

export const idb = {
  get: <T>(store: StoreName, key: IDBValidKey) => run<T | undefined>(store, "readonly", (s) => s.get(key)),
  put: (store: StoreName, value: unknown, key?: IDBValidKey) => run(store, "readwrite", (s) => (key === undefined ? s.put(value) : s.put(value, key))),
  del: (store: StoreName, key: IDBValidKey) => run(store, "readwrite", (s) => s.delete(key)),
  all: <T>(store: StoreName) => run<T[]>(store, "readonly", (s) => s.getAll()),
  clear: (store: StoreName) => run(store, "readwrite", (s) => s.clear()),
};
