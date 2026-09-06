import type { Order } from '../types';

const DB_NAME = 'sellerProOrderCache';
const DB_VERSION = 1;
const ORDERS_STORE = 'orders';
const META_STORE = 'metadata';

export interface OrderCacheScope {
  uid: string;
  role: string;
  sellerId: string;
}

export interface OrderCacheMeta {
  key: 'sync';
  scopeKey: string;
  lastSuccessfulSync: string | null;
  updatedAt: string;
  version: number;
}

const scopeKeyOf = (scope: OrderCacheScope): string =>
  `${scope.uid}::${scope.role}::${scope.sellerId}`;

const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('INDEXEDDB_REQUEST_FAILED'));
  });

const transactionToPromise = (transaction: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error || new Error('INDEXEDDB_TRANSACTION_FAILED'));
    transaction.onabort = () =>
      reject(transaction.error || new Error('INDEXEDDB_TRANSACTION_ABORTED'));
  });

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('INDEXEDDB_UNAVAILABLE'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(ORDERS_STORE)) {
        const store = db.createObjectStore(ORDERS_STORE, { keyPath: 'cacheKey' });
        store.createIndex('scopeKey', 'scopeKey', { unique: false });
      }

      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => {
      const db = request.result;

      db.onversionchange = () => {
        db.close();
      };

      resolve(db);
    };

    request.onerror = () => {
      reject(request.error || new Error('INDEXEDDB_OPEN_FAILED'));
    };
  });

  return dbPromise;
}

function cacheKey(scopeKey: string, orderId: string): string {
  return `${scopeKey}::${orderId}`;
}

export async function getCachedOrders(scope: OrderCacheScope): Promise<Order[]> {
  const db = await openDatabase();
  const scopeKey = scopeKeyOf(scope);

  const transaction = db.transaction(ORDERS_STORE, 'readonly');
  const store = transaction.objectStore(ORDERS_STORE);
  const index = store.index('scopeKey');

  const rows = await requestToPromise<Array<{
    cacheKey: string;
    scopeKey: string;
    order: Order;
  }>>(index.getAll(scopeKey));

  return rows.map(row => row.order);
}

export async function putCachedOrders(
  scope: OrderCacheScope,
  orders: Order[]
): Promise<void> {
  if (orders.length === 0) return;

  const db = await openDatabase();
  const scopeKey = scopeKeyOf(scope);

  const transaction = db.transaction(ORDERS_STORE, 'readwrite');
  const store = transaction.objectStore(ORDERS_STORE);

  for (const order of orders) {
    if (!order?.id) continue;

    store.put({
      cacheKey: cacheKey(scopeKey, order.id),
      scopeKey,
      order
    });
  }

  await transactionToPromise(transaction);
}

export async function deleteCachedOrders(
  scope: OrderCacheScope,
  orderIds: string[]
): Promise<void> {
  if (orderIds.length === 0) return;

  const db = await openDatabase();
  const scopeKey = scopeKeyOf(scope);

  const transaction = db.transaction(ORDERS_STORE, 'readwrite');
  const store = transaction.objectStore(ORDERS_STORE);

  for (const id of orderIds) {
    if (id) {
      store.delete(cacheKey(scopeKey, id));
    }
  }

  await transactionToPromise(transaction);
}

export async function getOrderCacheMeta(
  scope: OrderCacheScope
): Promise<OrderCacheMeta | null> {
  const db = await openDatabase();
  const transaction = db.transaction(META_STORE, 'readonly');
  const store = transaction.objectStore(META_STORE);

  const key = `sync::${scopeKeyOf(scope)}`;
  const result = await requestToPromise<OrderCacheMeta | undefined>(
    store.get(key)
  );

  return result || null;
}

export async function setOrderCacheMeta(
  scope: OrderCacheScope,
  lastSuccessfulSync: string | null
): Promise<void> {
  const db = await openDatabase();
  const transaction = db.transaction(META_STORE, 'readwrite');
  const store = transaction.objectStore(META_STORE);

  const meta: OrderCacheMeta = {
    key: `sync::${scopeKeyOf(scope)}` as OrderCacheMeta['key'],
    scopeKey: scopeKeyOf(scope),
    lastSuccessfulSync,
    updatedAt: new Date().toISOString(),
    version: DB_VERSION
  };

  store.put(meta);

  await transactionToPromise(transaction);
}

export async function clearOrderCache(
  scope: OrderCacheScope
): Promise<void> {
  const db = await openDatabase();
  const scopeKey = scopeKeyOf(scope);

  const transaction = db.transaction(ORDERS_STORE, 'readwrite');
  const store = transaction.objectStore(ORDERS_STORE);
  const index = store.index('scopeKey');

  const keys = await requestToPromise<IDBValidKey[]>(index.getAllKeys(scopeKey));

  for (const key of keys) {
    store.delete(key);
  }

  await transactionToPromise(transaction);

  const metaTransaction = db.transaction(META_STORE, 'readwrite');
  metaTransaction.objectStore(META_STORE).delete(`sync::${scopeKey}`);
  await transactionToPromise(metaTransaction);
}
