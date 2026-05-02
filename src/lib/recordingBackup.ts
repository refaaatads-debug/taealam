/**
 * IndexedDB backup for session recordings.
 * Persists the latest cumulative recording blob locally so that if upload
 * fails repeatedly (network drop, server outage), the recording can be
 * recovered and uploaded the next time the user opens the app.
 */

const DB_NAME = "session-recording-backup";
const STORE = "recordings";
const VERSION = 1;

interface BackupRecord {
  bookingId: string;
  userId: string;
  fileName: string;
  blob: Blob;
  size: number;
  savedAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "bookingId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveRecordingBackup(record: BackupRecord): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (e) {
    console.warn("[recording-backup] save failed:", e);
  }
}

export async function getRecordingBackup(bookingId: string): Promise<BackupRecord | null> {
  try {
    const db = await openDB();
    const result = await new Promise<BackupRecord | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(bookingId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  } catch (e) {
    console.warn("[recording-backup] read failed:", e);
    return null;
  }
}

export async function clearRecordingBackup(bookingId: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(bookingId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (e) {
    console.warn("[recording-backup] clear failed:", e);
  }
}

export async function listAllBackups(): Promise<BackupRecord[]> {
  try {
    const db = await openDB();
    const result = await new Promise<BackupRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  } catch {
    return [];
  }
}
