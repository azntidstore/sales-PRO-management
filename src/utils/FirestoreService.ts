import { 
  collection, 
  onSnapshot, 
  setDoc, 
  doc, 
  deleteDoc, 
  getDoc, 
  getDocs,
  query,
  orderBy
} from 'firebase/firestore';
import { db } from '../firebase';
import { Seller, Product, Order, SheetsSyncLog } from '../types';

// Dynamic seed files
const SEED_SELLERS: Seller[] = [
  { id: 'admin_1', name: 'عبد الله (Abdellah)', phone: '0600000000', active: true, createdAt: '2026-06-20T00:00:00.000Z', username: 'abdellah', email: 'ouaddou.abdellah.topo@gmail.com', role: 'ADMIN', password: '123' }
];

const SEED_PRODUCTS: Product[] = [];

const SEED_ORDERS: Order[] = [];

const SEED_LOGS: SheetsSyncLog[] = [];

export class FirestoreService {
  // Check if uninitialized and seed the database once
  static async verifyAndSeedDatabase() {
    try {
      const adminDocRef = doc(db, 'sellers', 'admin_1');
      const adminDoc = await getDoc(adminDocRef);

      if (!adminDoc.exists()) {
        await setDoc(adminDocRef, SEED_SELLERS[0]);
        console.log('Admin user created.');
      } else {
        console.log('Admin user admin_1 already exists, skipping overwrite.');
      }

      const sellersCol = collection(db, 'sellers');
      const sellersSnap = await getDocs(sellersCol);
      if (sellersSnap.empty) {
        console.log('Seeding Database with default parameters...');
        // Seed Sellers
        for (const s of SEED_SELLERS) {
          await setDoc(doc(db, 'sellers', s.id), s);
        }
        // Seed Products
        for (const p of SEED_PRODUCTS) {
          await setDoc(doc(db, 'products', p.id), p);
        }
        // Seed Orders
        for (const o of SEED_ORDERS) {
          await setDoc(doc(db, 'orders', o.id), o);
        }
        // Seed Logs
        for (const log of SEED_LOGS) {
          await setDoc(doc(db, 'syncLogs', log.id), log);
        }
        // Seed Settings
        await setDoc(doc(db, 'settings', 'sheetsConfig'), {
          sheetId: '1BxiMVs0XRA5nFMdKv1a6pbgH6uLIJG1cl8X1OWZY7M0',
          connected: true,
          lastSynced: '2026-06-18T14:45:00.000Z',
          syncQueue: []
        });
      }
    } catch (e: any) {
      if (e?.message?.includes('offline') || e?.code === 'unavailable') {
        console.warn('Database is currently offline. Skipped online seeding fallback.');
      } else {
        console.warn('Database seeding status:', e?.message || e);
      }
    }
  }

  // --- Sellers Actions ---
  static onSellersChange(callback: (sellers: Seller[]) => void) {
    const q = collection(db, 'sellers');
    return onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        // Run seed synchronously inside background
        this.verifyAndSeedDatabase();
        callback(SEED_SELLERS);
      } else {
        const list: Seller[] = [];
        snapshot.forEach((doc) => {
          list.push(doc.data() as Seller);
        });
        callback(list);
      }
    }, (error) => {
      console.warn('Sellers snapshot subscription status:', error.message);
    });
  }

  static async saveSeller(seller: Seller): Promise<void> {
    await setDoc(doc(db, 'sellers', seller.id), seller);
  }

  static async deleteSeller(id: string): Promise<void> {
    await deleteDoc(doc(db, 'sellers', id));
  }

  // --- Products Actions ---
  static onProductsChange(callback: (products: Product[]) => void) {
    const q = collection(db, 'products');
    return onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        callback([]);
      } else {
        const list: Product[] = [];
        snapshot.forEach((doc) => {
          list.push(doc.data() as Product);
        });
        callback(list);
      }
    }, (error) => {
      console.warn('Products snapshot subscription status:', error.message);
    });
  }

  static async saveProduct(product: Product): Promise<void> {
    await setDoc(doc(db, 'products', product.id), product);
  }

  static async deleteProduct(id: string): Promise<void> {
    await deleteDoc(doc(db, 'products', id));
  }

  // --- Orders Actions ---
  static onOrdersChange(callback: (orders: Order[]) => void) {
    const q = collection(db, 'orders');
    return onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        callback([]);
      } else {
        const list: Order[] = [];
        snapshot.forEach((doc) => {
          list.push(doc.data() as Order);
        });
        // Sort orders from newest to oldest by date or creation
        list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        callback(list);
      }
    }, (error) => {
      console.warn('Orders snapshot subscription status:', error.message);
    });
  }

  static async saveOrder(order: Order): Promise<void> {
    await setDoc(doc(db, 'orders', order.id), order);
  }

  static async deleteOrder(id: string): Promise<void> {
    await deleteDoc(doc(db, 'orders', id));
  }

  // --- Sync Logs Actions ---
  static onSyncLogsChange(callback: (logs: SheetsSyncLog[]) => void) {
    const q = collection(db, 'syncLogs');
    return onSnapshot(q, (snapshot) => {
      const list: SheetsSyncLog[] = [];
      snapshot.forEach((doc) => {
        list.push(doc.data() as SheetsSyncLog);
      });
      list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      callback(list);
    }, (error) => {
      console.warn('Sync logs snapshot subscription status:', error.message);
    });
  }

  static async saveSyncLog(log: SheetsSyncLog): Promise<void> {
    await setDoc(doc(db, 'syncLogs', log.id), log);
  }

  // --- Settings / Sheets Config ---
  static onSettingsChange(callback: (config: any) => void) {
    const dRef = doc(db, 'settings', 'sheetsConfig');
    return onSnapshot(dRef, (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.data());
      } else {
        const def = {
          sheetId: '1BxiMVs0XRA5nFMdKv1a6pbgH6uLIJG1cl8X1OWZY7M0',
          connected: true,
          lastSynced: '2026-06-18T14:45:00.000Z',
          syncQueue: []
        };
        setDoc(dRef, def);
        callback(def);
      }
    }, (error) => {
      console.warn('Settings snapshot subscription status:', error.message);
    });
  }

  static async getSheetsConfig() {
    const dRef = doc(db, 'settings', 'sheetsConfig');
    const snap = await getDoc(dRef);
    if (snap.exists()) {
      return snap.data();
    }
    const def = {
      sheetId: '1BxiMVs0XRA5nFMdKv1a6pbgH6uLIJG1cl8X1OWZY7M0',
      connected: true,
      lastSynced: '2026-06-18T14:45:00.000Z',
      syncQueue: []
    };
    await setDoc(dRef, def);
    return def;
  }

  static async saveSheetsConfig(config: any): Promise<void> {
    await setDoc(doc(db, 'settings', 'sheetsConfig'), config);
  }

  // --- Google Sheet Connection Simulation Sync ---
  static async syncOrderToSheets(order: Order, isNew: boolean): Promise<boolean> {
    const config = await this.getSheetsConfig();
    const timestamp = new Date().toISOString();
    const logId = 'log_' + Date.now() + Math.random().toString(36).substr(2, 4);

    if (config.connected) {
      const actionName = `${isNew ? 'CREATE_ORDER' : 'UPDATE_ORDER'} (${order.id})`;
      const newLog: SheetsSyncLog = {
        id: logId,
        timestamp,
        action: actionName,
        status: 'SUCCESS',
        details: `Successfully mirrored to Google Sheet: Client=${order.customerName}, Status=${order.orderStatus}, Profit=${order.profit} MAD.`
      };
      
      await this.saveSyncLog(newLog);
      
      config.lastSynced = timestamp;
      await this.saveSheetsConfig(config);
      return true;
    } else {
      const actionName = `${isNew ? 'CREATE_ORDER' : 'UPDATE_ORDER'} (${order.id})`;
      const newLog: SheetsSyncLog = {
        id: logId,
        timestamp,
        action: actionName,
        status: 'FAILED',
        details: 'Network Offline simulation activated. Order saved in Firestore cache queue.'
      };
      
      await this.saveSyncLog(newLog);
      
      if (!config.syncQueue.includes(order.id)) {
        config.syncQueue.push(order.id);
      }
      await this.saveSheetsConfig(config);
      return false;
    }
  }

  static async retrySyncAll(orders: Order[]): Promise<{ successCount: number; failed: boolean }> {
    const config = await this.getSheetsConfig();
    if (!config.connected) {
      const logId = 'log_' + Date.now();
      const newLog: SheetsSyncLog = {
        id: logId,
        timestamp: new Date().toISOString(),
        action: 'FORCE_RETRY_QUEUE',
        status: 'FAILED',
        details: 'Automated retry failed: Server is simulated to be offline.'
      };
      await this.saveSyncLog(newLog);
      return { successCount: 0, failed: true };
    }

    const pendingCount = config.syncQueue.length;
    if (pendingCount === 0) {
      return { successCount: 0, failed: false };
    }

    const timestamp = new Date().toISOString();
    const logId = 'log_' + Date.now();
    const newLog: SheetsSyncLog = {
      id: logId,
      timestamp,
      action: 'SYNC_QUEUE_FLUSH',
      status: 'SUCCESS',
      details: `Successfully synchronized all (${pendingCount}) cached orders to Google Sheet!`
    };

    config.syncQueue = [];
    config.lastSynced = timestamp;
    await this.saveSyncLog(newLog);
    await this.saveSheetsConfig(config);

    return { successCount: pendingCount, failed: false };
  }
}
