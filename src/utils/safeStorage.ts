// Safe Web Storage wrap helper that falls back to memory if localStorage is disabled/blocked in sandboxed iframes.
const memoryStore: Record<string, string> = {};

export const safeStorage = {
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn(`[SafeStorage] Fail to getItem for ${key}, falling back to memory:`, e);
      return memoryStore[key] || null;
    }
  },

  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn(`[SafeStorage] Fail to setItem for ${key}, saving to memory:`, e);
      memoryStore[key] = value;
    }
  },

  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn(`[SafeStorage] Fail to removeItem for ${key}, deleting from memory:`, e);
      delete memoryStore[key];
    }
  },

  clear(): void {
    try {
      localStorage.clear();
    } catch (e) {
      console.warn('[SafeStorage] Fail to clear localStorage, clearing memory:', e);
      for (const key in memoryStore) {
        delete memoryStore[key];
      }
    }
  }
};
