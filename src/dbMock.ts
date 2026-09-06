import { Seller, Product, Order, SheetsSyncLog, WorkspaceRole } from './types';
import { FirestoreService } from './utils/FirestoreService';
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
    cacheSellers = [...cacheSellers, seller];
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

  static getOrders(): Order[] {
    return cacheOrders;
  }

  static async createOrder(order: Order): Promise<Order> {
    requireFirebaseDatabase();
    if (isFirebaseConfigured) {
      try {
        const created = await FirestoreService.createOrder(order);
        cacheOrders = [...cacheOrders, created];
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
