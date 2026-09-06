import { Seller, Product, Order, SheetsSyncLog, WorkspaceRole } from './types';
import { FirestoreService } from './utils/FirestoreService';
import {
  deleteCachedOrders,
  getCachedOrders,
  getOrderCacheMeta,
  putCachedOrders,
  setOrderCacheMeta
} from './utils/OrderCache';
import { isFirebaseConfigured } from './firebase';

// Real-time memory cache
let cacheSellers: Seller[] = [];

/**
 * S5-D-C-C.5.1 Order Store
 * In-memory UI data only. Never used for authorization.
 * Legacy cache/listener remains intact until the UI integration gate.
 */
type OrderStoreState = {
  operational: Order[];
  historicalPages: Map<string, { orders: Order[]; nextCursor: any | null; hasMore: boolean }>;
};

const orderStore: OrderStoreState = {
  operational: [],
  historicalPages: new Map(),
};

function resetOrderStore(): void {
  orderStore.operational = [];
  orderStore.historicalPages.clear();
}

function publishOrderStoreOperational(orders: Order[]): void {
  orderStore.operational = [...orders];
}

function historicalPageKey(options: {
  pageSize?: number;
  startDate?: string;
  endDate?: string;
} = {}): string {
  return JSON.stringify({
    pageSize: Math.min(Math.max(options.pageSize ?? 50, 1), 100),
    startDate: options.startDate || '',
    endDate: options.endDate || '',
  });
}


let cacheProducts: Product[] = [];
let cacheOrders: Order[] = [];
let cacheLogs: SheetsSyncLog[] = [];
let cacheConfig: any = {
  sheetId: '1BxiMVs0XRA5nFMdKv1a6pbgH6uLIJG1cl8X1OWZY7M0',
  connected: true,
  lastSynced: '2026-06-18T14:45:00.000Z',
  syncQueue: []
};

let onChangeCallback: (() => void) | null = null;
let unsubscribes: (() => void)[] = [];

// Production database boundary: Firestore is the only persistent data source.
// LocalStorage is intentionally NOT used for sellers/products/orders/sync state.

const requireFirebaseDatabase = (): void => {
  if (!isFirebaseConfigured) {
    throw new Error('FIREBASE_NOT_CONFIGURED: persistent database access is unavailable.');
  }
};

// Initialization state is in-memory only; it is never persisted to browser storage.
export let isInitialized = false;

// Main initialization logic
async function attachFirebaseListeners(userRole?: string): Promise<void> {
  if (!isFirebaseConfigured) return;

  unsubscribes.forEach(u => u());
  unsubscribes = [];
  cacheSellers = [];
  cacheProducts = [];
  cacheOrders = [];
  resetOrderStore();
  cacheLogs = [];
  cacheConfig = {};
  if (onChangeCallback) onChangeCallback();

  try {
    console.log(`[SESSION] Attaching Firebase listeners for workspace: ${userRole || 'primary'}`);
    unsubscribes.push(
      FirestoreService.onSellersChange((data) => {
        cacheSellers = data;
        if (onChangeCallback) onChangeCallback();
      }, userRole as WorkspaceRole)
    );
    unsubscribes.push(
      FirestoreService.onProductsChange((data) => {
        cacheProducts = data;
        if (onChangeCallback) onChangeCallback();
      }, userRole as WorkspaceRole)
    );
    unsubscribes.push(
      FirestoreService.onOrdersChange((data) => {
        cacheOrders = data;
        if (onChangeCallback) onChangeCallback();
      }, userRole as WorkspaceRole)
    );
    if (userRole === 'ADMIN' || userRole === 'DEPUTY') {
      unsubscribes.push(
        FirestoreService.onSyncLogsChange((data) => {
          cacheLogs = data;
          if (onChangeCallback) onChangeCallback();
        })
      );
      unsubscribes.push(
        FirestoreService.onSettingsChange((data) => {
          cacheConfig = data;
          if (onChangeCallback) onChangeCallback();
        })
      );
    }
  } catch (err) {
    console.error('Firebase authorization initialization failed. Failing closed without local fallback.', err);
    cacheSellers = [];
    cacheProducts = [];
    cacheOrders = [];
    cacheLogs = [];
    cacheConfig = {};
    if (onChangeCallback) onChangeCallback();
  }
}

export async function initializeDatabase(userRole?: string): Promise<void> {
  if (isInitialized) return;
  isInitialized = true;
  if (isFirebaseConfigured) {
    console.log('Authorized Firebase database initialization. Automatic client seeding is disabled.');
    await attachFirebaseListeners(userRole);
  } else {
    console.warn('Firebase is not configured. Database remains locked; no local authentication fallback is available.');
    cacheSellers = [];
    cacheProducts = [];
    cacheOrders = [];
    cacheLogs = [];
    cacheConfig = {};
  }
}

export async function switchDatabaseWorkspace(userRole: string): Promise<void> {
  if (!isFirebaseConfigured) return;
  if (!isInitialized) {
    await initializeDatabase(userRole);
    return;
  }
  await attachFirebaseListeners(userRole);
}

// PHASE S2: Do not start Firestore listeners before Firebase Auth has
// established an authenticated, authorized user profile. App.tsx explicitly
// initializes the database after the auth/profile gate succeeds.

export class DatabaseService {
  static async initialize(userRole?: string): Promise<void> {
    await initializeDatabase(userRole);
  }

  static async switchWorkspace(userRole: string): Promise<void> {
    await switchDatabaseWorkspace(userRole);
  }

  // Callback trigger registered by active React views
  static onDataUpdated(cb: () => void) {
    onChangeCallback = cb;
  }

  static getSellers(): Seller[] {
    return cacheSellers;
  }

  static async createSeller(seller: Seller): Promise<void> {
    requireFirebaseDatabase();
    if (isFirebaseConfigured) {
      try {
        await FirestoreService.createSeller(seller);
      } catch (err: any) {
        FirestoreService.reportError('sellers_write', err?.message || String(err));
        throw err;
      }
    }
    cacheSellers = [...cacheSellers, { ...seller }];
    if (onChangeCallback) onChangeCallback();
  }

  static async updateSeller(id: string, patch: Partial<Seller>): Promise<void> {
    requireFirebaseDatabase();
    if (isFirebaseConfigured) {
      try {
        await FirestoreService.updateSeller(id, patch);
      } catch (err: any) {
        FirestoreService.reportError('sellers_write', err?.message || String(err));
        throw err;
      }
    }
    cacheSellers = cacheSellers.map(s => s.id === id ? { ...s, ...patch, id } : s);
    if (onChangeCallback) onChangeCallback();
  }

  static async deleteSeller(id: string): Promise<void> {
    requireFirebaseDatabase();
    if (isFirebaseConfigured) {
      try {
        await FirestoreService.deleteSeller(id);
      } catch (err: any) {
        FirestoreService.reportError('sellers_write', err?.message || String(err));
        throw err;
      }
    }
    cacheSellers = cacheSellers.filter(s => s.id !== id);
    if (onChangeCallback) onChangeCallback();
  }

  static async createProduct(product: Product): Promise<void> {
    requireFirebaseDatabase();
    if (isFirebaseConfigured) {
      try {
        await FirestoreService.createProduct(product);
      } catch (err: any) {
        FirestoreService.reportError('products_write', err?.message || String(err));
        throw err;
      }
    }
    cacheProducts = [...cacheProducts, product];
    if (onChangeCallback) onChangeCallback();
  }

  static async updateProduct(id: string, patch: Partial<Product>): Promise<void> {
    requireFirebaseDatabase();
    if (isFirebaseConfigured) {
      try {
        await FirestoreService.updateProduct(id, patch);
      } catch (err: any) {
        FirestoreService.reportError('products_write', err?.message || String(err));
        throw err;
      }
    }
    cacheProducts = cacheProducts.map(p => p.id === id ? { ...p, ...patch, id } : p);
    if (onChangeCallback) onChangeCallback();
  }

  static async deleteProduct(id: string): Promise<void> {
    requireFirebaseDatabase();
    if (isFirebaseConfigured) {
      try {
        await FirestoreService.deleteProduct(id);
      } catch (err: any) {
        FirestoreService.reportError('products_write', err?.message || String(err));
        throw err;
      }
    }
    cacheProducts = cacheProducts.filter(p => p.id !== id);
    if (onChangeCallback) onChangeCallback();
  }

  static getProducts(): Product[] {
    // The product cache is already role-scoped by FirestoreService.onProductsChange().
    // Return the current scoped cache without performing another Firestore read.
    return cacheProducts;
  }

  static getOrderEligibleProducts(): Product[] {
    // Order UI may only select active products from the already role-scoped cache.
    // This is a presentation/selection filter, not an authorization boundary.
    return cacheProducts.filter((product) => product.active);
  }


  static async getOperationalOrders(days = 30, pageSize = 100): Promise<{
    orders: Order[];
    nextCursor: any | null;
    hasMore: boolean;
  }> {
    if (isFirebaseConfigured) {
      return FirestoreService.getOperationalOrders(days, pageSize);
    }
    throw new Error('FIREBASE_NOT_CONFIGURED');
  }
  static async getHistoricalOrdersPage(options: {
    pageSize?: number;
    cursor?: any;
    startDate?: string;
    endDate?: string;
  } = {}): Promise<{
    orders: Order[];
    nextCursor: any | null;
    hasMore: boolean;
  }> {
    if (isFirebaseConfigured) {
      return FirestoreService.getHistoricalOrdersPage(options);
    }
    throw new Error('FIREBASE_NOT_CONFIGURED');
  }
  static getOperationalOrderStore(): Order[] {
    return [...orderStore.operational];
  }

  static async loadOperationalOrderStore(days = 30, pageSize = 100): Promise<{
    orders: Order[];
    nextCursor: any | null;
    hasMore: boolean;
  }> {
    const result = await DatabaseService.getOperationalOrders(days, pageSize);
    publishOrderStoreOperational(result.orders);
    return result;
  }

  static async getDashboardOrdersByOrderDate(options: {
    startDate: string;
    endDate: string;
    pageSize?: number;
  }): Promise<{ orders: Order[]; complete: boolean; pages: number }> {
    if (isFirebaseConfigured) {
      return FirestoreService.getDashboardOrdersByOrderDate(options);
    }
    throw new Error('FIREBASE_NOT_CONFIGURED');
  }
  static async loadHistoricalOrderPage(options: {
    pageSize?: number;
    cursor?: any;
    startDate?: string;
    endDate?: string;
  } = {}): Promise<{
    orders: Order[];
    nextCursor: any | null;
    hasMore: boolean;
  }> {
    const key = historicalPageKey(options);
    if (!options.cursor) {
      const cached = orderStore.historicalPages.get(key);
      if (cached) return { ...cached, orders: [...cached.orders] };
    }
    const result = await DatabaseService.getHistoricalOrdersPage(options);
    if (!options.cursor) {
      orderStore.historicalPages.set(key, { ...result, orders: [...result.orders] });
    }
    return result;
  }

  static async getOrderForView(id: string): Promise<Order | null> {
    requireFirebaseDatabase();
    const operational = orderStore.operational.find(o => o.id === id);
    if (operational) return operational;
    return FirestoreService.getOrderById(id);
  }

  /**
   * Order Visibility Fix:
   * Explicit cursor-based pagination for the Orders screen.
   *
   * This method is intentionally separate from getOrders(),
   * which remains the realtime operational cache.
   */
  static async getOrdersPage(options: {
    pageSize?: number;
    cursor?: {
      admin?: any | null;
      seller?: any | null;
      supervisorOwn?: any | null;
      supervisorChildren?: any | null;
    } | null;
  } = {}): Promise<{
    orders: Order[];
    nextCursor: {
      admin?: any | null;
      seller?: any | null;
      supervisorOwn?: any | null;
      supervisorChildren?: any | null;
    } | null;
    hasMore: boolean;
  }> {
    requireFirebaseDatabase();

    return FirestoreService.getOrdersPage(options);
  }
  /**
   * B3-C: Initial full synchronization of the authorized order scope.
   *
   * Firestore remains the authorization/source-of-truth boundary.
   * IndexedDB is only a local presentation cache.
   *
   * Safety rules:
   * - Reads only through the existing role-scoped getOrdersPage().
   * - Continues until hasMore === false.
   * - Never deletes cached orders because they are absent from a page.
   * - lastSuccessfulSync is written only after every page succeeds.
   */
  static async initialFullOrderSync(): Promise<{
    ordersSynced: number;
    pages: number;
    completedAt: string;
  }> {
    requireFirebaseDatabase();

    const syncStartedAt = new Date().toISOString();
    const syncScope = await FirestoreService.getOrderSyncScope();

    if (!syncScope.uid || !syncScope.sellerId) {
      throw new Error('ORDER_FULL_SYNC_UNAUTHORIZED');
    }

    const scope = {
      uid: syncScope.uid,
      role: syncScope.role,
      sellerId: syncScope.sellerId
    };

    let cursor: {
      admin?: any | null;
      seller?: any | null;
      supervisorOwn?: any | null;
      supervisorChildren?: any | null;
    } | null = null;

    let hasMore = true;
    let pages = 0;
    let ordersSynced = 0;

    while (hasMore) {
      const result = await FirestoreService.getOrdersPage({
        pageSize: 100,
        cursor
      });

      pages += 1;

      if (result.orders.length > 0) {
        await putCachedOrders(scope, result.orders);
        ordersSynced += result.orders.length;
      }

      hasMore = result.hasMore;
      cursor = result.nextCursor;
    }

    const completedAt = new Date().toISOString();

    await setOrderCacheMeta(scope, syncStartedAt);

    return {
      ordersSynced,
      pages,
      completedAt
    };
  }
  static async loadOrderCacheIntoMemory(): Promise<number> {
    requireFirebaseDatabase();

    const syncScope = await FirestoreService.getOrderSyncScope();

    if (!syncScope.uid || !syncScope.sellerId) {
      throw new Error('ORDER_CACHE_LOAD_UNAUTHORIZED');
    }

    const scope = {
      uid: syncScope.uid,
      role: syncScope.role,
      sellerId: syncScope.sellerId
    };

    const cached = await getCachedOrders(scope);
    cacheOrders = cached;

    if (onChangeCallback) onChangeCallback();

    return cached.length;
  }
  /**
   * B4: Incremental synchronization from the last successful watermark.
   * Reads only documents whose trusted server updatedAt is at/after the watermark.
   * The watermark advances only after every requested page has been cached.
   */
  static async incrementalOrderSync(): Promise<{
    skipped: boolean;
    ordersSynced: number;
    pages: number;
    startedAt: string;
    completedAt: string;
  }> {
    requireFirebaseDatabase();

    const syncScope = await FirestoreService.getOrderSyncScope();
    const scope = {
      uid: syncScope.uid,
      role: syncScope.role,
      sellerId: syncScope.sellerId
    };
    const meta = await getOrderCacheMeta(scope);

    if (!meta?.lastSuccessfulSync) {
      return {
        skipped: true,
        ordersSynced: 0,
        pages: 0,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      };
    }

    const startedAt = new Date().toISOString();
    let cursor: {
      admin?: any | null;
      seller?: any | null;
      supervisorOwn?: any | null;
      supervisorChildren?: any | null;
    } | null = null;
    let hasMore = true;
    let pages = 0;
    let ordersSynced = 0;

    while (hasMore) {
      const result = await FirestoreService.getOrdersIncrementalPage({
        since: meta.lastSuccessfulSync,
        pageSize: 100,
        cursor
      });
      pages += 1;
      if (result.orders.length > 0) {
        await putCachedOrders(scope, result.orders);
        ordersSynced += result.orders.length;
      }
      hasMore = result.hasMore;
      cursor = result.nextCursor;
    }

    await setOrderCacheMeta(scope, startedAt);
    await DatabaseService.loadOrderCacheIntoMemory();

    return {
      skipped: false,
      ordersSynced,
      pages,
      startedAt,
      completedAt: new Date().toISOString()
    };
  }

  /**
   * B4 wiring: use a one-time full sync for a new cache, then incremental syncs.
   * The caller does not need to know which phase is required.
   */
  static async synchronizeOrders(): Promise<{
    mode: 'full' | 'incremental';
    ordersSynced: number;
    pages: number;
  }> {
    const incremental = await DatabaseService.incrementalOrderSync();

    if (!incremental.skipped) {
      return {
        mode: 'incremental',
        ordersSynced: incremental.ordersSynced,
        pages: incremental.pages
      };
    }

    const full = await DatabaseService.initialFullOrderSync();
    await DatabaseService.loadOrderCacheIntoMemory();

    return {
      mode: 'full',
      ordersSynced: full.ordersSynced,
      pages: full.pages
    };
  }
  static getOrders(): Order[] {
    return cacheOrders;
  }

  static async createOrder(order: Order): Promise<Order> {
    requireFirebaseDatabase();
    if (isFirebaseConfigured) {
      try {
        const created = await FirestoreService.createOrder(order);
        cacheOrders = [...cacheOrders, created];
        // B4-C-PERSIST-CREATE
        const scope = await FirestoreService.getOrderSyncScope();
        await putCachedOrders(scope, [created]);
        if (onChangeCallback) onChangeCallback();
        return created;
      } catch (err: any) {
        FirestoreService.reportError('orders_write', err?.message || String(err));
        throw err;
      }
    }
    cacheOrders = [...cacheOrders, order];
    if (onChangeCallback) onChangeCallback();
    return order;
  }

  /** S5-D-C-C.5.9 prototype; intentionally not wired to Dashboard yet. */
  static async getDashboardAllAggregates(): Promise<{
    complete: boolean; orders: number; pending: number; delivered: number; delayed: number; rejected: number;
    totalSales: number; totalProfits: number; queries: number;
  }> {
    requireFirebaseDatabase();
    return FirestoreService.getDashboardAllAggregates();
  }

  static async updateOrder(id: string, patch: Partial<Order>, expectedUpdatedAt: string): Promise<Order> {
    requireFirebaseDatabase();
    if (isFirebaseConfigured) {
      try {
        const updated = await FirestoreService.updateOrder(id, patch, expectedUpdatedAt);
        cacheOrders = cacheOrders.map(o => o.id === id ? updated : o);
        // B4-C-PERSIST-UPDATE
        const scope = await FirestoreService.getOrderSyncScope();
        await putCachedOrders(scope, [updated]);
        if (onChangeCallback) onChangeCallback();
        return updated;
      } catch (err: any) {
        FirestoreService.reportError('orders_write', err?.message || String(err));
        throw err;
      }
    }
    const updated = cacheOrders.find(o => o.id === id);
    const fallback = updated ? { ...updated, ...patch, id } : ({ ...patch, id } as Order);
    cacheOrders = cacheOrders.map(o => o.id === id ? fallback : o);
    if (onChangeCallback) onChangeCallback();
    return fallback;
  }

  static async deleteOrder(id: string): Promise<void> {
    requireFirebaseDatabase();
    if (isFirebaseConfigured) {
      try {
        await FirestoreService.deleteOrder(id);
      } catch (err: any) {
        FirestoreService.reportError('orders_write', err?.message || String(err));
        throw err;
      }
    }
    cacheOrders = cacheOrders.filter(o => o.id !== id);
    // B4-C-PERSIST-DELETE
    const scope = await FirestoreService.getOrderSyncScope();
    await deleteCachedOrders(scope, [id]);
    if (onChangeCallback) onChangeCallback();
  }

  static getSheetsLogs(): SheetsSyncLog[] {
    return cacheLogs;
  }

  static async saveSheetsLogs(logs: SheetsSyncLog[]): Promise<void> {
    requireFirebaseDatabase();
    cacheLogs = logs;
    if (isFirebaseConfigured) {
      try {
        await Promise.all(logs.map(log => FirestoreService.saveSyncLog(log)));
        FirestoreService.reportError('logs_write', null);
      } catch (err: any) {
        console.error('Failed to save sync logs to Firestore:', err);
        FirestoreService.reportError('logs_write', err?.message || String(err));
      }
    }
    if (onChangeCallback) onChangeCallback();
  }

  static getSheetsConfig() {
    return cacheConfig;
  }

  static async saveSheetsConfig(config: any): Promise<void> {
    requireFirebaseDatabase();
    cacheConfig = config;
    if (isFirebaseConfigured) {
      try {
        await FirestoreService.saveSheetsConfig(config);
        FirestoreService.reportError('settings_write', null);
      } catch (err: any) {
        console.error('Failed to save sheets configuration to Firestore:', err);
        FirestoreService.reportError('settings_write', err?.message || String(err));
      }
    }
    if (onChangeCallback) onChangeCallback();
  }

  static syncOrderToSheets(order: Order, isNew: boolean): boolean {
    if (!isFirebaseConfigured) return false;
    FirestoreService.syncOrderToSheets(order, isNew).catch(err => {
      console.error('Failed to sync order to sheets via Firestore:', err);
    });
    return true;
  }

  static retrySyncAll(): { successCount: number; failed: boolean } {
    if (!isFirebaseConfigured) return { successCount: 0, failed: true };
    const count = cacheConfig.syncQueue?.length || 0;
    FirestoreService.retrySyncAll(cacheOrders).catch(err => {
      console.error('Failed to retry sync queue:', err);
    });
    return { successCount: count, failed: false };
  }


}



