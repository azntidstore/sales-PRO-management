import { Seller, Product, Order, SheetsSyncLog } from './types';
import { FirestoreService } from './utils/FirestoreService';
import { isFirebaseConfigured } from './firebase';
import { safeStorage } from './utils/safeStorage';

// Real-time memory cache
let cacheSellers: Seller[] = [];
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

// ==========================================
// هذا كود زائد - يمكنك حذفه بعد تحميل المشروع
// CODE À SUPPRIMER APRÈS EXPORT (DEFAULT MOCKS HAVE BEEN CLEARED)
// ==========================================
const DEFAULT_LOCAL_SELLERS: Seller[] = [
  { 
    id: 'admin_1', 
    name: 'عبد الله (Abdellah)', 
    phone: '0600000000', 
    active: true, 
    createdAt: '2026-06-20T00:00:00.000Z', 
    username: 'abdellah', 
    email: 'ouaddou.abdellah.topo@gmail.com', 
    role: 'ADMIN',
    password: '123'
  }
];
const DEFAULT_LOCAL_PRODUCTS: Product[] = [];
const DEFAULT_LOCAL_ORDERS: Order[] = [];
// ==========================================
// هذا كود زائد - يمكنك حذفه بعد تحميل المشروع
// ==========================================

// Local storage helpers used when Firestore isn't connected
const loadLocal = (key: string, fallback: any) => {
  // ==========================================
  // هذا كود زائد - يمكنك حذفه بعد تحميل المشروع
  // ==========================================
  try {
    const val = safeStorage.getItem(`smart_crm_${key}`);
    return val ? JSON.parse(val) : fallback;
  } catch {
    return fallback;
  }
  // ==========================================
  // هذا كود زائد - يمكنك حذفه بعد تحميل المشروع
  // ==========================================
};

const saveLocal = (key: string, val: any) => {
  // ==========================================
  // هذا كود زائد - يمكنك حذفه بعد تحميل المشروع
  // ==========================================
  try {
    safeStorage.setItem(`smart_crm_${key}`, JSON.stringify(val));
  } catch {}
  // ==========================================
  // هذا كود زائد - يمكنك حذفه بعد تحميل المشروع
  // ==========================================
};

// Initialize variables and state flag
export let isInitialized = false;

// Load data from LocalStorage as fallback or baseline
export function loadFromLocalStorage() {
  cacheSellers = loadLocal('sellers', DEFAULT_LOCAL_SELLERS);
  if (!Array.isArray(cacheSellers)) {
    cacheSellers = DEFAULT_LOCAL_SELLERS;
  }
  cacheProducts = loadLocal('products', DEFAULT_LOCAL_PRODUCTS);
  if (!Array.isArray(cacheProducts)) {
    cacheProducts = DEFAULT_LOCAL_PRODUCTS;
  }
  cacheOrders = loadLocal('orders', DEFAULT_LOCAL_ORDERS);
  if (!Array.isArray(cacheOrders)) {
    cacheOrders = DEFAULT_LOCAL_ORDERS;
  }
  cacheLogs = loadLocal('syncLogs', []);
  if (!Array.isArray(cacheLogs)) {
    cacheLogs = [];
  }
  cacheConfig = loadLocal('sheetsConfig', cacheConfig);
}

// Save data to LocalStorage
export function saveToLocalStorage() {
  saveLocal('sellers', cacheSellers);
  saveLocal('products', cacheProducts);
  saveLocal('orders', cacheOrders);
  saveLocal('syncLogs', cacheLogs);
  saveLocal('sheetsConfig', cacheConfig);
}

// Main initialization logic
export async function initializeDatabase(): Promise<void> {
  if (isInitialized) return;
  isInitialized = true;

  // Render immediately with local baseline
  loadFromLocalStorage();

  if (isFirebaseConfigured) {
    try {
      // Explicitly run seeding and verification
      await FirestoreService.verifyAndSeedDatabase();
      console.log('Database verification and seeding completed.');

      // Setup snapshot listeners
      unsubscribes.push(
        FirestoreService.onSellersChange((data) => {
          cacheSellers = data;
          saveLocal('sellers', data);
          if (onChangeCallback) onChangeCallback();
        })
      );
      unsubscribes.push(
        FirestoreService.onProductsChange((data) => {
          cacheProducts = data;
          saveLocal('products', data);
          if (onChangeCallback) onChangeCallback();
        })
      );
      unsubscribes.push(
        FirestoreService.onOrdersChange((data) => {
          cacheOrders = data;
          saveLocal('orders', data);
          if (onChangeCallback) onChangeCallback();
        })
      );
      unsubscribes.push(
        FirestoreService.onSyncLogsChange((data) => {
          cacheLogs = data;
          saveLocal('syncLogs', data);
          if (onChangeCallback) onChangeCallback();
        })
      );
      unsubscribes.push(
        FirestoreService.onSettingsChange((data) => {
          cacheConfig = data;
          saveLocal('sheetsConfig', data);
          if (onChangeCallback) onChangeCallback();
        })
      );
    } catch (err) {
      console.warn('Firebase initialization resolved to local standby mode. Falling back to secure localStorage baseline:', err);
      loadFromLocalStorage();
    }
  } else {
    console.log('Smart CRM is running in Local Standby Offline Mode. Real-time Firebase listeners are disabled.');
  }
}

// Auto-trigger on module load to guarantee instant execution
initializeDatabase().catch(err => {
  console.error("Auto DB initialization failed:", err);
});

// Helper to calculate profit exactly based on rules
export function calculateOrderProfit(
  wholesalePrice: number,
  sellingPrice: number,
  quantity: number,
  deliveryCost: number,
  totalAmount: number,
  status: string
): number {
  if (status !== 'DELIVERED') {
    return 0;
  }
  // Formula: TotalAmount - DeliveryCost - (WholesalePrice * Quantity)
  const productCost = wholesalePrice * quantity;
  return totalAmount - deliveryCost - productCost;
}

export class DatabaseService {
  static async initialize(): Promise<void> {
    await initializeDatabase();
  }

  // Callback trigger registered by active React views
  static onDataUpdated(cb: () => void) {
    onChangeCallback = cb;
  }

  static getSellers(): Seller[] {
    return cacheSellers;
  }

  static async saveSellers(sellers: Seller[]): Promise<void> {
    cacheSellers = sellers;
    saveLocal('sellers', sellers);
    if (isFirebaseConfigured) {
      try {
        await Promise.all(sellers.map(s => FirestoreService.saveSeller(s)));
      } catch (err) {
        console.error('Failed to save sellers to Firestore:', err);
      }
    }
    if (onChangeCallback) onChangeCallback();
  }

  static getProducts(): Product[] {
    return cacheProducts;
  }

  static async saveProducts(products: Product[]): Promise<void> {
    cacheProducts = products;
    saveLocal('products', products);
    if (isFirebaseConfigured) {
      try {
        await Promise.all(products.map(p => FirestoreService.saveProduct(p)));
      } catch (err) {
        console.error('Failed to save products to Firestore:', err);
      }
    }
    if (onChangeCallback) onChangeCallback();
  }

  static getOrders(): Order[] {
    return cacheOrders;
  }

  static async saveOrders(orders: Order[]): Promise<void> {
    cacheOrders = orders;
    saveLocal('orders', orders);
    if (isFirebaseConfigured) {
      try {
        await Promise.all(orders.map(o => FirestoreService.saveOrder(o)));
      } catch (err) {
        console.error('Failed to save orders to Firestore:', err);
      }
    }
    if (onChangeCallback) onChangeCallback();
  }

  static getSheetsLogs(): SheetsSyncLog[] {
    return cacheLogs;
  }

  static async saveSheetsLogs(logs: SheetsSyncLog[]): Promise<void> {
    cacheLogs = logs;
    saveLocal('syncLogs', logs);
    if (isFirebaseConfigured) {
      try {
        await Promise.all(logs.map(log => FirestoreService.saveSyncLog(log)));
      } catch (err) {
        console.error('Failed to save sync logs to Firestore:', err);
      }
    }
    if (onChangeCallback) onChangeCallback();
  }

  static getSheetsConfig() {
    return cacheConfig;
  }

  static async saveSheetsConfig(config: any): Promise<void> {
    cacheConfig = config;
    saveLocal('sheetsConfig', config);
    if (isFirebaseConfigured) {
      try {
        await FirestoreService.saveSheetsConfig(config);
      } catch (err) {
        console.error('Failed to save sheets configuration to Firestore:', err);
      }
    }
    if (onChangeCallback) onChangeCallback();
  }

  static syncOrderToSheets(order: Order, isNew: boolean): boolean {
    if (isFirebaseConfigured) {
      FirestoreService.syncOrderToSheets(order, isNew).catch(err => {
        console.error('Failed to sync order to sheets via Firestore:', err);
      });
    } else {
      // ==========================================
      // هذا كود زائد - يمكنك حذفه بعد تحميل المشروع
      // ==========================================
      const timestamp = new Date().toISOString();
      const logId = 'log_' + Date.now() + Math.random().toString(36).substring(2, 6);
      
      if (cacheConfig.connected) {
        const actionName = `${isNew ? 'CREATE_ORDER' : 'UPDATE_ORDER'} (${order.id})`;
        const newLog: SheetsSyncLog = {
          id: logId,
          timestamp,
          action: actionName,
          status: 'SUCCESS',
          details: `[Local Mode] Successfully simulated mirror: Client=${order.customerName}, Status=${order.orderStatus}, Profit=${order.profit} MAD.`
        };
        const updatedLogs = [newLog, ...cacheLogs];
        this.saveSheetsLogs(updatedLogs);

        const updatedConfig = { ...cacheConfig, lastSynced: timestamp };
        this.saveSheetsConfig(updatedConfig);
      }
      // ==========================================
      // هذا كود زائد - يمكنك حذفه بعد تحميل المشروع
      // ==========================================
    }
    return true;
  }

  static retrySyncAll(): { successCount: number; failed: boolean } {
    const count = cacheConfig.syncQueue?.length || 0;
    if (isFirebaseConfigured) {
      FirestoreService.retrySyncAll(cacheOrders).catch(err => {
        console.error('Failed to retry sync queue:', err);
      });
    } else {
      // ==========================================
      // هذا كود زائد - يمكنك حذفه بعد تحميل المشروع
      // ==========================================
      const updatedConfig = { ...cacheConfig, syncQueue: [] };
      this.saveSheetsConfig(updatedConfig);
      // ==========================================
      // هذا كود زائد - يمكنك حذفه بعد تحميل المشروع
      // ==========================================
    }
    return { successCount: count, failed: false };
  }
}
