const DB_NAME = 'csvMergeDB';
const DB_VERSION = 1;
const STORE_NAME = 'files';

export interface FileData {
  id: 'deFile' | 'productFile';
  name: string;
  type: string;
  size: number;
  content?: any[];
  mergedData?: any[];
}

export class DBService {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
    });

    return this.initPromise;
  }

  async saveFile(data: FileData): Promise<void> {
    if (!this.db) {
      await this.init();
      if (!this.db) {
        throw new Error('Failed to initialize database');
      }
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(data);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getFile(id: FileData['id']): Promise<FileData | null> {
    if (!this.db) {
      await this.init();
      if (!this.db) {
        throw new Error('Failed to initialize database');
      }
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async deleteFile(id: FileData['id']): Promise<void> {
    if (!this.db) {
      await this.init();
      if (!this.db) {
        throw new Error('Failed to initialize database');
      }
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
}