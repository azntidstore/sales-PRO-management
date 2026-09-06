import { 
  collection, 
  onSnapshot, 
  setDoc, 
  doc, 
  deleteDoc, 
  getDoc, 
  getDocs,
  getAggregateFromServer,
  count,
  sum,
  updateDoc,
  runTransaction,
  arrayUnion,
  query,
  where,
  or,
  orderBy,
  limit,
  startAfter,
  QueryDocumentSnapshot,
  DocumentData
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Seller, Product, Order, SheetsSyncLog, AuthorizationProfile, WorkspaceRole } from '../types';
import { AuthService } from './AuthService';

// Helper to sanitize data before sending to Firestore (removes undefined values which Firestore setDoc rejects)
export function sanitizeForFirestore<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }
  if (Array.isArray(data)) {
    return data
      .filter(item => item !== undefined && item !== null)
      .map(item => sanitizeForFirestore(item)) as unknown as T;
  }
  if (typeof data === 'object' && data.constructor === Object) {
    const cleanObj: Record<string, any> = {};
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined && val !== null) {
        cleanObj[key] = sanitizeForFirestore(val);
      }
    }
    return cleanObj as T;
  }
  return data;
}

export class FirestoreService {
  static lastError: string | null = null;
  static activeErrors: Map<string, string> = new Map();
  private static authorizationProfileRequest: Promise<AuthorizationProfile | null> | null = null;
  static onErrorCallbacks: Set<(err: string | null) => void> = new Set();

  static onConnectionError(cb: (err: string | null) => void) {
    this.onErrorCallbacks.add(cb);
    cb(this.lastError);
    return () => {
      this.onErrorCallbacks.delete(cb);
    };
  }

  static reportError(source: string, msg: string | null) {
    if (msg) {
      this.activeErrors.set(source, msg);
    } else {
      this.activeErrors.delete(source);
    }
    const combinedError = this.activeErrors.size > 0 
      ? Array.from(this.activeErrors.values()).join(' | ') 
      : null;
    this.lastError = combinedError;
    this.onErrorCallbacks.forEach(cb => cb(combinedError));
  }

  // PHASE S2: Production clients must never seed authorization or business data.
  // Kept as a compatibility no-op so older callers do not accidentally create data.
  static async verifyAndSeedDatabase(): Promise<void> {
    console.info('[SECURITY] Automatic Firestore seeding is disabled in production client.');
  }

  private static async getAuthorizationProfile(requiredRole?: WorkspaceRole): Promise<AuthorizationProfile | null> {
    const user = auth?.currentUser;
    if (!user) return null;

    // S5-D-B: coalesce concurrent profile reads during startup/re-subscription.
    // This is NOT a persistent authorization cache; every new call after the
    // current request settles performs a fresh Firestore read.
    if (this.authorizationProfileRequest) {
      const profile = await this.authorizationProfileRequest;
      if (requiredRole && !profile?.roles.includes(requiredRole)) return null;
      return profile;
    }

    const uid = user.uid;
    this.authorizationProfileRequest = (async () => {
      const snap = await getDoc(doc(db, 'users', uid));
      if (!snap.exists() || auth?.currentUser?.uid !== uid) return null;
      const data = snap.data() as any;
      if (data.uid !== uid || typeof data.sellerId !== 'string' || !data.sellerId ||
          !data.role || data.active !== true) return null;
      const primaryRole = data.role as WorkspaceRole;
      const declaredRoles = Array.isArray(data.roles)
        ? data.roles.filter((r: unknown): r is WorkspaceRole =>
            r === 'SELLER' || r === 'SUPERVISOR' || r === 'DEPUTY' || r === 'ADMIN')
        : [];
      const roles = Array.from(new Set<WorkspaceRole>([primaryRole, ...declaredRoles]));
      // Do not add a seller-document read here: role-context metadata is carried
      // by the authorization profile. Relationship details remain resolved by
      // existing scoped seller queries, preserving the Free-plan read budget.
      return {
        uid,
        sellerId: data.sellerId,
        role: primaryRole,
        roles,
        roleContexts: roles.map((r) => ({
          role: r,
          sellerId: data.sellerId,
        })),
        name: data.name || '',
        active: true,
      };
    })().finally(() => {
      this.authorizationProfileRequest = null;
    });

    const profile = await this.authorizationProfileRequest;
    if (requiredRole && !profile?.roles.includes(requiredRole)) return null;
    return profile;
  }

  // --- Sellers Actions ---
  static onSellersChange(callback: (sellers: Seller[]) => void, workspaceRole?: WorkspaceRole) {
    let stopped = false;
    const unsubs: (() => void)[] = [];

    const attach = async () => {
      const profile = await this.getAuthorizationProfile(workspaceRole);
      if (stopped || !profile) return;

      const role = workspaceRole || profile.role;
      const queries = role === 'ADMIN' || role === 'DEPUTY'
        ? [collection(db, 'sellers')]
        : role === 'SUPERVISOR'
          ? [
              query(collection(db, 'sellers'), where('parentId', '==', profile.sellerId)),
              query(collection(db, 'sellers'), where('parentIds', 'array-contains', profile.sellerId))
            ]
          : [query(collection(db, 'sellers'), where('uid', '==', profile.uid))];

      const byId = new Map<string, Seller>();
      const publish = () => {
        const list = Array.from(byId.values()).map((item) => {
          const directParent = item.parentId || '';
          const pIds = Array.isArray(item.parentIds) ? item.parentIds.filter(Boolean) : (directParent ? [directParent] : []);
          return { ...item, id: item.id || '', parentId: directParent || (pIds[0] || ''), parentIds: pIds, phone: item.phone || '' };
        });
        callback(list);
      };

      for (const q of queries) {
        const unsub = onSnapshot(q, (snapshot) => {
          snapshot.docChanges().forEach(change => {
            const item = change.doc.data() as Seller;
            const id = item.id || change.doc.id;
            if (change.type === 'removed') byId.delete(id);
            else byId.set(id, { ...item, id });
          });
          FirestoreService.reportError('sellers_read', null);
          publish();
        }, (error) => {
          console.warn('Sellers snapshot subscription status:', error.message);
          FirestoreService.reportError('sellers_read', error.message);
        });
        unsubs.push(unsub);
      }
    };
    void attach();
    return () => { stopped = true; unsubs.forEach(u => u()); };
  }

  /**
   * B4-C: Seller account provisioning.
   *
   * Firebase Authentication is server-managed through /api/sellers.
   * The client never creates or stores seller passwords.
   */
  static async provisionSellerAccount(seller: Seller): Promise<{ uid: string; authCreated: boolean }> {
    if (!auth?.currentUser) {
      throw new Error('AUTH_REQUIRED');
    }

    const token = await auth.currentUser.getIdToken();
    const response = await fetch('/api/sellers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ seller }),
    });

    let payload: any = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok || !payload?.ok || !payload?.uid) {
      throw new Error(payload?.error || `SELLER_PROVISIONING_FAILED_${response.status}`);
    }

    try {
      await AuthService.sendPasswordReset(seller.email || seller.username || '');
    } catch (resetError) {
      console.warn('[SELLER PROVISIONING] Account linked, but password reset email failed:', resetError);
    }

    return {
      uid: payload.uid,
      authCreated: payload.authCreated === true,
    };
  }

  static async createSeller(seller: Seller): Promise<void> {
    const provisioned = await this.provisionSellerAccount(seller);

    // Keep the local object consistent with the server-canonical UID.
    // Firestore is already updated by the provisioning API.
    if (!seller.uid && provisioned.uid) {
      seller.uid = provisioned.uid;
    }
  }

  static async updateSeller(id: string, patch: Partial<Seller>): Promise<void> {
    await updateDoc(doc(db, 'sellers', id), sanitizeForFirestore({ ...patch, id }));
  }

  static async deleteSeller(id: string): Promise<void> {
    await deleteDoc(doc(db, 'sellers', id));
  }

  static async getSellersOnce(): Promise<Seller[]> {
    const profile = await this.getAuthorizationProfile();
    if (!profile) return [];
    let q;
    if (profile.role === 'ADMIN' || profile.role === 'DEPUTY') {
      q = collection(db, 'sellers');
    } else if (profile.role === 'SUPERVISOR') {
      const [direct, multiple] = await Promise.all([
        getDocs(query(collection(db, 'sellers'), where('parentId', '==', profile.sellerId))),
        getDocs(query(collection(db, 'sellers'), where('parentIds', 'array-contains', profile.sellerId)))
      ]);
      const merged = new Map<string, Seller>();
      [...direct.docs, ...multiple.docs].forEach(snap => { merged.set(snap.id, { ...(snap.data() as Seller), id: (snap.data() as Seller).id || snap.id }); });
      return Array.from(merged.values());
    } else {
      q = query(collection(db, 'sellers'), where('uid', '==', profile.uid));
    }
    const snapshot = await getDocs(q);
    return snapshot.docs.map(snap => ({ ...(snap.data() as Seller), id: (snap.data() as Seller).id || snap.id }));
  }

  // --- Products Actions ---
  static onProductsChange(callback: (products: Product[]) => void, workspaceRole?: WorkspaceRole) {
    let stopped = false;
    const attach = async () => {
      const profile = await this.getAuthorizationProfile(workspaceRole);
      if (stopped || !profile) return;
      const role = workspaceRole || profile.role;
      const base = collection(db, 'products');
      const q = role === 'SUPERVISOR'
        ? query(base, where('supervisorUids', 'array-contains', profile.uid))
        : base;
    const unsub = onSnapshot(q, (snapshot) => {
      FirestoreService.reportError('products_read', null);
      if (snapshot.empty) {
        callback([]);
      } else {
        const list: Product[] = [];
        snapshot.forEach((doc) => {
          const item = doc.data() as Product;
          list.push({
            ...item,
            id: item.id || doc.id
          });
        });
        callback(list);
      }
    }, (error) => {
      console.warn('Products snapshot subscription status:', error.message);
      FirestoreService.reportError('products_read', error.message);
    });
    return () => { stopped = true; unsub(); };
    };
    let unsubscribe: (() => void) | undefined;
    void attach().then((unsub) => { unsubscribe = unsub; });
    return () => { stopped = true; unsubscribe?.(); };
  }

  static async createProduct(product: Product): Promise<void> {
    await setDoc(doc(db, 'products', product.id), sanitizeForFirestore(product));
  }

  static async updateProduct(id: string, patch: Partial<Product>): Promise<void> {
    await updateDoc(doc(db, 'products', id), sanitizeForFirestore({ ...patch, id }));
  }

  static async deleteProduct(id: string): Promise<void> {
    await deleteDoc(doc(db, 'products', id));
  }

  // --- Orders Actions ---
  static onOrdersChange(callback: (orders: Order[]) => void, workspaceRole?: WorkspaceRole) {
    let stopped = false;
    const unsubs: (() => void)[] = [];
    const byId = new Map<string, Order>();

    const attach = async () => {
      const profile = await this.getAuthorizationProfile(workspaceRole);
      if (stopped || !profile) return;
      const role = workspaceRole || profile.role;
      // S5-D-C-C.5.5: keep the permanent realtime listener operational and bounded.
      // Historical Dashboard/report reads are explicit and on-demand.
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const base = collection(db, 'orders');
      const operationalQuery = (scopeField?: 'sellerId' | 'assignedSupervisorId') => {
        const constraints: any[] = [];
        if (scopeField) constraints.push(where(scopeField, '==', profile.sellerId));
        constraints.push(where('createdAt', '>=', cutoff));
        constraints.push(orderBy('createdAt', 'desc'));
        constraints.push(limit(100));
        return query(base, ...constraints);
      };
      const queries = role === 'SELLER'
        ? [operationalQuery('sellerId')]
        : role === 'SUPERVISOR'
          ? [operationalQuery('assignedSupervisorId'), operationalQuery('sellerId')]
          : [operationalQuery()];

      const publish = () => {
        const list = Array.from(byId.values());
        list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        callback(list);
      };

      for (const q of queries) {
        const unsub = onSnapshot(q, (snapshot) => {
          snapshot.docChanges().forEach(change => {
            const item = change.doc.data() as Order;
            const id = item.id || change.doc.id;
            if (change.type === 'removed') byId.delete(id);
            else byId.set(id, { ...item, id });
          });
          FirestoreService.reportError('orders_read', null);
          publish();
        }, (error) => {
          console.warn('Orders snapshot subscription status:', error.message);
          FirestoreService.reportError('orders_read', error.message);
        });
        unsubs.push(unsub);
      }
    };
    void attach();
    return () => { stopped = true; unsubs.forEach(u => u()); };
  }

  /** E3-E: all order writes go through the trusted server API. Firestore Rules intentionally deny direct client writes. */
  private static async callSessionApi(method: 'GET' | 'POST' | 'PATCH', payload: Record<string, any>): Promise<any> {
    const user = auth?.currentUser;
    if (!user) throw new Error('AUTH_REQUIRED');
    const token = await user.getIdToken();
    const url = method === 'GET' ? `/api/sessions?sessionId=${encodeURIComponent(String(payload.sessionId || ''))}` : '/api/sessions';
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      ...(method === 'GET' ? {} : { body: JSON.stringify(payload) }),
    });
    let body: any = null;
    try { body = await response.json(); } catch { /* handled below */ }
    if (!response.ok || !body?.ok) throw new Error(body?.error || `SESSION_API_${response.status}`);
    return body.session;
  }

  private static async callTrustedOrderApi(method: 'POST' | 'PATCH' | 'DELETE', payload: Record<string, any>): Promise<Order> {
    const user = auth?.currentUser;
    if (!user) throw new Error('AUTH_REQUIRED');
    const token = await user.getIdToken();
    const response = await fetch('/api/orders', {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
    let body: any = null;
    try { body = await response.json(); } catch { /* handled below */ }
    if (!response.ok || !body?.ok) {
      const error = new Error(body?.error || `ORDER_API_${response.status}`);
      throw error;
    }
    return body.order as Order;
  }

  static async createOrder(order: Order): Promise<Order> {
    const items = Array.isArray(order.items) && order.items.length
      ? order.items.map(item => ({ productId: item.productId, quantity: item.quantity }))
      : (order.productId ? [{ productId: order.productId, quantity: order.quantity }] : []);
    return this.callTrustedOrderApi('POST', {
      orderDate: order.orderDate,
      customerName: order.customerName,
      phone: order.phone,
      city: order.city,
      address: order.address,
      notes: order.notes,
      deliveryCost: order.deliveryCost,
      orderStatus: order.orderStatus,
      sellerId: order.sellerId,
      assignedSupervisorId: order.assignedSupervisorId,
      items
    });
  }

  /**
   * S5-D-C-C: targeted single-order read for historical/on-demand flows.
   * Authorization remains enforced by Firestore Rules; this method never
   * broad-reads the orders collection.
   */

  /**
   * S5-D-C-C.4
   * Bounded operational order window. This is intentionally read-only and
   * separate from the legacy realtime listener so existing consumers remain
   * compatible while the UI migrates to explicit data loading.
   *
   * `days` is bounded defensively to avoid accidental unbounded reads.
   */
  static async getOperationalOrders(days = 30, pageSize = 100): Promise<{
    orders: Order[];
    nextCursor: any | null;
    hasMore: boolean;
  }> {
    const profile = await this.getAuthorizationProfile();
    if (!profile?.active || !profile.sellerId) {
      return { orders: [], nextCursor: null, hasMore: false };
    }

    const safeDays = Math.min(Math.max(Number.isFinite(days) ? Math.floor(days) : 30, 1), 90);
    const safePageSize = Math.min(Math.max(Number.isFinite(pageSize) ? Math.floor(pageSize) : 100, 1), 100);

    const cutoff = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000).toISOString();
    const base = collection(db, 'orders');

    let q;
    if (profile.role === 'SELLER') {
      q = query(
        base,
        where('sellerId', '==', profile.sellerId),
        where('createdAt', '>=', cutoff),
        orderBy('createdAt', 'desc'),
        limit(safePageSize + 1)
      );
    } else if (profile.role === 'SUPERVISOR') {
      // Supervisor scope is a union of two independently authorized queries.
      // We intentionally do not invent a merged cursor; the caller receives
      // a bounded union and can use historical/single-document APIs for older data.
      const [assigned, own] = await Promise.all([
        getDocs(query(
          base,
          where('assignedSupervisorId', '==', profile.sellerId),
          where('createdAt', '>=', cutoff),
          orderBy('createdAt', 'desc'),
          limit(safePageSize)
        )),
        getDocs(query(
          base,
          where('sellerId', '==', profile.sellerId),
          where('createdAt', '>=', cutoff),
          orderBy('createdAt', 'desc'),
          limit(safePageSize)
        ))
      ]);

      const byId = new Map<string, Order>();
      for (const snap of [...assigned.docs, ...own.docs]) {
        const item = { ...(snap.data() as Order), id: snap.id };
        byId.set(item.id, item);
      }
      const orders = Array.from(byId.values())
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
        .slice(0, safePageSize);

      return {
        orders,
        nextCursor: null,
        hasMore: assigned.size >= safePageSize || own.size >= safePageSize
      };
    } else {
      q = query(
        base,
        where('createdAt', '>=', cutoff),
        orderBy('createdAt', 'desc'),
        limit(safePageSize + 1)
      );
    }

    const snapshot = await getDocs(q);
    const docs = snapshot.docs.slice(0, safePageSize);
    const orders = docs.map((docSnap) => ({ ...(docSnap.data() as Order), id: docSnap.id }));
    const hasMore = snapshot.docs.length > safePageSize;
    const nextCursor = hasMore ? docs[docs.length - 1] : null;

    return { orders, nextCursor, hasMore };
  }

  /**
   * S5-D-C-C.4
   * Historical, on-demand page. The query is always bounded and role-scoped.
   * Optional date bounds allow Dashboard/reporting callers to request only
   * the period they actually need.
   */
  /**
   * S5-D-C-C.5.5
   * Complete on-demand Dashboard reads using the persisted `orderDate` field.
   * This is intentionally separate from createdAt-based historical pagination:
   * Dashboard semantics are defined by orderDate. The method is only intended
   * for exact calendar-date ranges (e.g. today / this_month). It exhausts the
   * bounded pages for the requested range so the caller can mark the result
   * complete without relying on the operational realtime window.
   */
  static async getDashboardOrdersByOrderDate(options: {
    startDate: string;
    endDate: string;
    pageSize?: number;
  }): Promise<{ orders: Order[]; complete: boolean; pages: number }> {
    const profile = await this.getAuthorizationProfile();
    if (!profile?.active || !profile.sellerId) {
      return { orders: [], complete: true, pages: 0 };
    }

    const startDate = String(options.startDate || '').trim();
    const endDate = String(options.endDate || '').trim();
    if (!startDate || !endDate || startDate > endDate) {
      return { orders: [], complete: false, pages: 0 };
    }

    const safePageSize = Math.min(Math.max(
      Number.isFinite(options.pageSize) ? Math.floor(options.pageSize as number) : 100,
      1
    ), 100);
    const base = collection(db, 'orders');

    const readScope = async (scopeField?: 'sellerId' | 'assignedSupervisorId') => {
      const out: Order[] = [];
      let cursor: any = null;
      let hasMore = true;
      let pages = 0;
      while (hasMore) {
        const constraints: any[] = [];
        if (scopeField) constraints.push(where(scopeField, '==', profile.sellerId));
        constraints.push(where('orderDate', '>=', startDate));
        constraints.push(where('orderDate', '<=', endDate));
        constraints.push(orderBy('orderDate', 'desc'));
        constraints.push(limit(safePageSize + 1));
        if (cursor) constraints.push(startAfter(cursor));
        const snapshot = await getDocs(query(base, ...constraints));
        const docs = snapshot.docs.slice(0, safePageSize);
        out.push(...docs.map(snap => ({ ...(snap.data() as Order), id: snap.id })));
        hasMore = snapshot.docs.length > safePageSize;
        cursor = hasMore ? docs[docs.length - 1] : null;
        pages += 1;
      }
      return { orders: out, pages };
    };

    if (profile.role === 'SUPERVISOR') {
      const [assigned, own] = await Promise.all([
        readScope('assignedSupervisorId'),
        readScope('sellerId')
      ]);
      const byId = new Map<string, Order>();
      for (const order of [...assigned.orders, ...own.orders]) byId.set(order.id, order);
      return {
        orders: Array.from(byId.values()).sort((a, b) => (b.orderDate || '').localeCompare(a.orderDate || '')),
        complete: true,
        pages: assigned.pages + own.pages
      };
    }

    const result = await readScope(profile.role === 'SELLER' ? 'sellerId' : undefined);
    return { orders: result.orders, complete: true, pages: result.pages };
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
    const profile = await this.getAuthorizationProfile();
    if (!profile?.active || !profile.sellerId) {
      return { orders: [], nextCursor: null, hasMore: false };
    }

    const safePageSize = Math.min(Math.max(
      Number.isFinite(options.pageSize) ? Math.floor(options.pageSize as number) : 50,
      1
    ), 100);

    const base = collection(db, 'orders');
    const constraints: any[] = [];

    if (profile.role === 'SELLER') {
      constraints.push(where('sellerId', '==', profile.sellerId));
    }

    // Supervisor pagination remains deliberately unsupported as a single cursor
    // because its authorization scope is a union of two independent queries.
    if (profile.role === 'SUPERVISOR') {
      throw new Error('ORDER_HISTORICAL_PAGINATION_SCOPE_UNSUPPORTED');
    }

    if (options.startDate) constraints.push(where('createdAt', '>=', options.startDate));
    if (options.endDate) constraints.push(where('createdAt', '<=', options.endDate));

    constraints.push(orderBy('createdAt', 'desc'));
    constraints.push(limit(safePageSize + 1));
    if (options.cursor) constraints.push(startAfter(options.cursor));

    const snapshot = await getDocs(query(base, ...constraints));
    const docs = snapshot.docs.slice(0, safePageSize);
    const orders = docs.map((docSnap) => ({ ...(docSnap.data() as Order), id: docSnap.id }));
    const hasMore = snapshot.docs.length > safePageSize;
    const nextCursor = hasMore ? docs[docs.length - 1] : null;

    return { orders, nextCursor, hasMore };
  }

  static async getOrderById(id: string): Promise<Order | null> {
    const snap = await getDoc(doc(db, 'orders', id));
    if (!snap.exists()) return null;
    const item = snap.data() as Order;
    return { ...item, id: item.id || snap.id };
  }

  /**
   * S5-D-C-C: paged order reads for roles whose authorization scope maps to
   * one Firestore query. This is a data-layer primitive only; the existing
   * realtime listener remains unchanged until the UI migration is separately
   * validated.
   *
   * Supervisor pagination is intentionally deferred because its current
   * authorization scope is the union of two queries and requires a cursor
   * merge design that cannot safely discard unconsumed documents.
   */
  /**
   * Order Visibility Fix:
   * Cursor-based order pagination for the Orders screen.
   *
   * IMPORTANT:
   * - This is NOT a realtime listener.
   * - It does NOT replace onOrdersChange().
   * - It never performs writes/deletes.
   * - It preserves role-scoped Firestore reads.
   * - It reads at most the requested page size per call.
   *
   * Supervisor scope is a union of:
   *   1. supervisor's own seller orders
   *   2. child seller orders assigned to this supervisor
   *
   * A single Firestore cursor cannot safely represent that union.
   * Therefore supervisor pagination uses two independent cursors and
   * merges the two ordered streams deterministically.
   */
  /**
   * Complete role-scoped order pagination.
   *
   * IMPORTANT:
   * - Read-only.
   * - Never deletes or modifies orders.
   * - The Orders screen uses this paged source instead of the
   *   bounded realtime cache.
   * - Supervisor scope is the union of:
   *     A) own seller orders
   *     B) orders explicitly assigned to this supervisor
   *   Each stream has an independent cursor.
   */
  /**
   * B3-C: Returns the minimum authorization context required
   * by the local order synchronization layer.
   *
   * Authorization remains owned by FirestoreService.
   * IndexedDB is only a local presentation cache and never
   * acts as an authorization boundary.
   */
  static async getOrderSyncScope(): Promise<{
    uid: string;
    role: WorkspaceRole;
    sellerId: string;
  }> {
    const profile = await this.getAuthorizationProfile();

    if (!profile?.active || !profile.uid || !profile.sellerId) {
      throw new Error('ORDER_FULL_SYNC_UNAUTHORIZED');
    }

    return {
      uid: profile.uid,
      role: profile.role,
      sellerId: profile.sellerId
    };
  }
  static async getOrdersIncrementalPage(options: {
    since: string;
    pageSize?: number;
    cursor?: {
      admin?: QueryDocumentSnapshot<DocumentData> | null;
      seller?: QueryDocumentSnapshot<DocumentData> | null;
      supervisorOwn?: QueryDocumentSnapshot<DocumentData> | null;
      supervisorChildren?: QueryDocumentSnapshot<DocumentData> | null;
    } | null;
  }): Promise<{
    orders: Order[];
    nextCursor: {
      admin?: QueryDocumentSnapshot<DocumentData> | null;
      seller?: QueryDocumentSnapshot<DocumentData> | null;
      supervisorOwn?: QueryDocumentSnapshot<DocumentData> | null;
      supervisorChildren?: QueryDocumentSnapshot<DocumentData> | null;
    } | null;
    hasMore: boolean;
  }> {
    if (typeof options?.since !== 'string' || Number.isNaN(Date.parse(options.since))) {
      throw new Error('ORDER_INCREMENTAL_SYNC_INVALID_WATERMARK');
    }

    const safePageSize = Math.max(1, Math.min(100, Math.floor(
      Number.isFinite(options.pageSize) ? Number(options.pageSize) : 100
    )));
    const syncScope = await this.getOrderSyncScope();
    const base = collection(db, 'orders');

    const toOrder = (snap: QueryDocumentSnapshot<DocumentData>): Order => ({
      ...(snap.data() as Order),
      id: (snap.data() as Order).id || snap.id
    });

    const fetchStream = async (
      field: 'sellerId' | 'assignedSupervisorId' | null,
      cursor: QueryDocumentSnapshot<DocumentData> | null | undefined
    ) => {
      const constraints: any[] = [];
      if (field) constraints.push(where(field, '==', syncScope.sellerId));
      constraints.push(where('updatedAt', '>=', options.since));
      constraints.push(orderBy('updatedAt', 'asc'));
      if (cursor) constraints.push(startAfter(cursor));
      constraints.push(limit(safePageSize));
      const snapshot = await getDocs(query(base, ...constraints));
      return {
        docs: snapshot.docs,
        orders: snapshot.docs.map(toOrder),
        hasMore: snapshot.docs.length === safePageSize,
        nextCursor: snapshot.docs.length ? snapshot.docs[snapshot.docs.length - 1] : null
      };
    };

    if (syncScope.role === 'SUPERVISOR') {
      const own = await fetchStream('sellerId', options.cursor?.supervisorOwn);
      const children = await fetchStream('assignedSupervisorId', options.cursor?.supervisorChildren);
      const merged = new Map<string, Order>();
      [...own.orders, ...children.orders].forEach(order => merged.set(order.id, order));
      const orders = [...merged.values()].sort((a, b) =>
        String(a.updatedAt || '').localeCompare(String(b.updatedAt || ''))
      );
      return {
        orders,
        nextCursor: {
          supervisorOwn: own.hasMore ? own.nextCursor : null,
          supervisorChildren: children.hasMore ? children.nextCursor : null
        },
        hasMore: own.hasMore || children.hasMore
      };
    }

    const field = syncScope.role === 'SELLER' ? 'sellerId' : null;
    const stream = await fetchStream(field, syncScope.role === 'SELLER' ? options.cursor?.seller : options.cursor?.admin);
    return {
      orders: stream.orders,
      nextCursor: syncScope.role === 'SELLER'
        ? { seller: stream.hasMore ? stream.nextCursor : null }
        : { admin: stream.hasMore ? stream.nextCursor : null },
      hasMore: stream.hasMore
    };
  }

  static async getOrdersPage(options: {
    pageSize?: number;
    cursor?: {
      admin?: QueryDocumentSnapshot<DocumentData> | null;
      seller?: QueryDocumentSnapshot<DocumentData> | null;
      supervisorOwn?: QueryDocumentSnapshot<DocumentData> | null;
      supervisorChildren?: QueryDocumentSnapshot<DocumentData> | null;
    } | null;
  } = {}): Promise<{
    orders: Order[];
    nextCursor: {
      admin?: QueryDocumentSnapshot<DocumentData> | null;
      seller?: QueryDocumentSnapshot<DocumentData> | null;
      supervisorOwn?: QueryDocumentSnapshot<DocumentData> | null;
      supervisorChildren?: QueryDocumentSnapshot<DocumentData> | null;
    } | null;
    hasMore: boolean;
  }> {
    const safePageSize = Math.max(
      1,
      Math.min(
        100,
        Math.floor(
          Number.isFinite(options.pageSize)
            ? Number(options.pageSize)
            : 50
        )
      )
    );

    const profile = await this.getAuthorizationProfile();

    if (!profile?.active || !profile.sellerId) {
      return {
        orders: [],
        nextCursor: null,
        hasMore: false
      };
    }

    const base = collection(db, 'orders');

    const toOrder = (
      snap: QueryDocumentSnapshot<DocumentData>
    ): Order => {
      const item = snap.data() as Order;
      return {
        ...item,
        id: item.id || snap.id
      };
    };

    const getCreatedAt = (order: Order): string => {
      if (typeof order.createdAt === 'string') return order.createdAt;
      if (order.createdAt && typeof order.createdAt === 'object' && 'toDate' in order.createdAt) {
        try {
          return (order.createdAt as any).toDate().toISOString();
        } catch {
          return '';
        }
      }
      return '';
    };

    const compareOrders = (a: Order, b: Order): number => {
      const dateCompare = getCreatedAt(b).localeCompare(getCreatedAt(a));
      if (dateCompare !== 0) return dateCompare;
      return a.id.localeCompare(b.id);
    };

    // ------------------------------------------------
    // SELLER
    // ------------------------------------------------

    if (profile.role === 'SELLER') {
      const cursor = options.cursor?.seller || null;

      const constraints: any[] = [
        where('sellerId', '==', profile.sellerId),
        orderBy('createdAt', 'desc'),
        limit(safePageSize + 1)
      ];

      if (cursor) {
        constraints.push(startAfter(cursor));
      }

      const snapshot = await getDocs(query(base, ...constraints));
      const pageDocs = snapshot.docs.slice(0, safePageSize);
      const orders = pageDocs.map(toOrder);
      const hasMore = snapshot.docs.length > safePageSize;

      return {
        orders,
        nextCursor: hasMore
          ? { seller: pageDocs[pageDocs.length - 1] }
          : null,
        hasMore
      };
    }

    // ------------------------------------------------
    // ADMIN / DEPUTY
    // ------------------------------------------------

    if (profile.role === 'ADMIN' || profile.role === 'DEPUTY') {
      const cursor = options.cursor?.admin || null;

      const constraints: any[] = [
        orderBy('createdAt', 'desc'),
        limit(safePageSize + 1)
      ];

      if (cursor) {
        constraints.push(startAfter(cursor));
      }

      const snapshot = await getDocs(query(base, ...constraints));
      const pageDocs = snapshot.docs.slice(0, safePageSize);
      const orders = pageDocs.map(toOrder);
      const hasMore = snapshot.docs.length > safePageSize;

      return {
        orders,
        nextCursor: hasMore
          ? { admin: pageDocs[pageDocs.length - 1] }
          : null,
        hasMore
      };
    }

    // ------------------------------------------------
    // SUPERVISOR
    // ------------------------------------------------

    if (profile.role === 'SUPERVISOR') {
      /*
       * Authorization scope MUST match the existing rules/listener:
       *
       * A) sellerId == supervisor's sellerId
       * B) assignedSupervisorId == supervisor's sellerId
       *
       * Never substitute hierarchy/child-seller discovery here.
       */

      const ownCursor = options.cursor?.supervisorOwn || null;
      const assignedCursor = options.cursor?.supervisorChildren || null;

      const ownConstraints: any[] = [
        where('sellerId', '==', profile.sellerId),
        orderBy('createdAt', 'desc'),
        limit(safePageSize + 1)
      ];

      const assignedConstraints: any[] = [
        where('assignedSupervisorId', '==', profile.sellerId),
        orderBy('createdAt', 'desc'),
        limit(safePageSize + 1)
      ];

      if (ownCursor) {
        ownConstraints.push(startAfter(ownCursor));
      }

      if (assignedCursor) {
        assignedConstraints.push(startAfter(assignedCursor));
      }

      const [ownSnapshot, assignedSnapshot] = await Promise.all([
        getDocs(query(base, ...ownConstraints)),
        getDocs(query(base, ...assignedConstraints))
      ]);

      const ownDocs = ownSnapshot.docs.slice(0, safePageSize);
      const assignedDocs = assignedSnapshot.docs.slice(0, safePageSize);

      /*
       * Merge both ordered streams deterministically.
       * A document may belong to both scopes, so deduplicate by Firestore id.
       */
      const merged = new Map<string, {
        order: Order;
        source: 'own' | 'assigned';
        index: number;
      }>();

      ownDocs.forEach((snap, index) => {
        merged.set(snap.id, {
          order: toOrder(snap),
          source: 'own',
          index
        });
      });

      assignedDocs.forEach((snap, index) => {
        if (!merged.has(snap.id)) {
          merged.set(snap.id, {
            order: toOrder(snap),
            source: 'assigned',
            index
          });
        }
      });

      const mergedEntries = Array.from(merged.values())
        .sort((a, b) => compareOrders(a.order, b.order));

      /*
       * We deliberately fetch up to pageSize from each stream.
       * The next cursor advances only to the last document actually
       * consumed from each stream. This prevents skipping documents.
       */
      const consumed = mergedEntries.slice(0, safePageSize);

      const ownConsumed = consumed
        .filter(entry => entry.source === 'own')
        .map(entry => entry.order.id);

      const assignedConsumed = consumed
        .filter(entry => entry.source === 'assigned')
        .map(entry => entry.order.id);

      const ownLastId = ownConsumed[ownConsumed.length - 1];
      const assignedLastId = assignedConsumed[assignedConsumed.length - 1];

      const ownLastDoc = ownLastId
        ? ownDocs.find(docSnap => docSnap.id === ownLastId) || null
        : null;

      const assignedLastDoc = assignedLastId
        ? assignedDocs.find(docSnap => docSnap.id === assignedLastId) || null
        : null;

      const ownHasUnconsumed =
        ownDocs.length > ownConsumed.length ||
        ownSnapshot.docs.length > safePageSize;

      const assignedHasUnconsumed =
        assignedDocs.length > assignedConsumed.length ||
        assignedSnapshot.docs.length > safePageSize;

      const hasMore = ownHasUnconsumed || assignedHasUnconsumed;

      return {
        orders: consumed.map(entry => entry.order),
        nextCursor: hasMore
          ? {
              supervisorOwn: ownLastDoc || ownCursor,
              supervisorChildren: assignedLastDoc || assignedCursor
            }
          : null,
        hasMore
      };
    }

    throw new Error('ORDER_PAGINATION_SCOPE_UNSUPPORTED');
  }
  static async getDashboardAllAggregates(): Promise<{
    complete: boolean;
    orders: number;
    pending: number;
    delivered: number;
    delayed: number;
    rejected: number;
    totalSales: number;
    totalProfits: number;
    queries: number;
  }> {
    const profile = await this.getAuthorizationProfile();
    if (!profile?.active || !profile.sellerId) {
      return { complete: true, orders: 0, pending: 0, delivered: 0, delayed: 0, rejected: 0, totalSales: 0, totalProfits: 0, queries: 0 };
    }

    const base = collection(db, 'orders');
    const statusSet = new Set<Order['orderStatus']>(['PENDING', 'DELIVERED', 'DELAYED', 'REJECTED']);
    let queryCount = 0;

    // Supervisor scope is a union that current R3 Rules can authorize only as
    // two independent queries. Exact scalar aggregation is therefore not
    // possible without either an unsafe compound query or a potentially
    // lossy overlap assumption. For correctness, read the two authorized
    // scopes page-by-page and de-duplicate by document id in memory.
    // This path is intentionally limited to SUPERVISOR; ADMIN/DEPUTY/SELLER
    // continue to use server-side aggregation queries.
    if (profile.role === 'SUPERVISOR') {
      const readScope = async (field: 'assignedSupervisorId' | 'sellerId') => {
        const out = new Map<string, Order>();
        let cursor: QueryDocumentSnapshot<DocumentData> | null = null;
        let hasMore = true;
        const pageSize = 100;
        while (hasMore) {
          const constraints: any[] = [where(field, '==', profile.sellerId), limit(pageSize)];
          if (cursor) constraints.push(startAfter(cursor));
          queryCount += 1;
          const snapshot = await getDocs(query(base, ...constraints));
          for (const snap of snapshot.docs) {
            out.set(snap.id, { ...(snap.data() as Order), id: snap.id });
          }
          hasMore = snapshot.docs.length === pageSize;
          cursor = snapshot.docs.length ? snapshot.docs[snapshot.docs.length - 1] : null;
        }
        return out;
      };

      const [assigned, own] = await Promise.all([
        readScope('assignedSupervisorId'),
        readScope('sellerId'),
      ]);
      for (const [id, order] of assigned) own.set(id, order);

      let pending = 0;
      let delivered = 0;
      let delayed = 0;
      let rejected = 0;
      let totalSales = 0;
      let totalProfits = 0;
      for (const order of own.values()) {
        totalSales += Number(order.totalAmount || 0);
        totalProfits += Number(order.profit || 0);
        if (statusSet.has(order.orderStatus)) {
          if (order.orderStatus === 'PENDING') pending += 1;
          else if (order.orderStatus === 'DELIVERED') delivered += 1;
          else if (order.orderStatus === 'DELAYED') delayed += 1;
          else if (order.orderStatus === 'REJECTED') rejected += 1;
        }
      }
      return {
        complete: true,
        orders: own.size,
        pending,
        delivered,
        delayed,
        rejected,
        totalSales,
        totalProfits,
        queries: queryCount,
      };
    }

    const scopeConstraints = (status?: Order['orderStatus']): any[] => {
      const constraints: any[] = [];
      if (profile.role === 'SELLER') constraints.push(where('sellerId', '==', profile.sellerId));
      if (status) constraints.push(where('orderStatus', '==', status));
      return constraints;
    };

    const aggregateTotals = async () => {
      queryCount += 1;
      const result = await getAggregateFromServer(
        query(base, ...scopeConstraints()),
        { orders: count(), totalSales: sum('totalAmount'), totalProfits: sum('profit') }
      );
      const data = result.data();
      return {
        orders: Number(data.orders || 0),
        totalSales: Number(data.totalSales || 0),
        totalProfits: Number(data.totalProfits || 0),
      };
    };

    const totals = await aggregateTotals();
    const statuses: Order['orderStatus'][] = ['PENDING', 'DELIVERED', 'DELAYED', 'REJECTED'];
    const aggregateStatusCount = async (status: Order['orderStatus']) => {
      queryCount += 1;
      const result = await getAggregateFromServer(
        query(base, ...scopeConstraints(status)),
        { orders: count() },
      );
      return Number(result.data().orders || 0);
    };
    const statusCounts = await Promise.all(statuses.map(aggregateStatusCount));

    return {
      complete: true,
      orders: Math.max(0, totals.orders),
      pending: statusCounts[0],
      delivered: statusCounts[1],
      delayed: statusCounts[2],
      rejected: statusCounts[3],
      totalSales: totals.totalSales,
      totalProfits: totals.totalProfits,
      queries: queryCount,
    };
  }

  static async updateOrder(id: string, patch: Partial<Order>, expectedUpdatedAt: string): Promise<Order> {
    if (typeof expectedUpdatedAt !== 'string' || !expectedUpdatedAt) {
      throw new Error('ORDER_CONCURRENCY_EXPECTED_VERSION_REQUIRED');
    }
    // updatedAt is server-owned; never send a client-generated timestamp.
    const { updatedAt: _clientUpdatedAt, ...safePatch } = patch as any;
    void _clientUpdatedAt;
    return this.callTrustedOrderApi('PATCH', {
      id,
      expectedUpdatedAt,
      ...safePatch,
      items: Array.isArray(patch.items) ? patch.items.map(item => ({ productId: item.productId, quantity: item.quantity })) : undefined,
    });
  }

  static async openSettlementSession(sellerId?: string): Promise<any> {
    return this.callSessionApi('POST', sellerId ? { sellerId } : {});
  }

  static async getSettlementSession(sessionId: string): Promise<any> {
    return this.callSessionApi('GET', { sessionId });
  }

  static async closeSettlementSession(sessionId: string): Promise<any> {
    return this.callSessionApi('PATCH', { sessionId });
  }

  static async deleteOrder(id: string): Promise<void> {
    await this.callTrustedOrderApi('DELETE', { id });
  }

  // --- Sync Logs Actions ---
  static onSyncLogsChange(callback: (logs: SheetsSyncLog[]) => void) {
    // Operational feed only: keep a bounded recent window instead of replaying
    // the complete audit collection to every management client.
    const q = query(collection(db, 'syncLogs'), orderBy('timestamp', 'desc'), limit(100));
    const unsub = onSnapshot(q, (snapshot) => {
      const list: SheetsSyncLog[] = [];
      snapshot.forEach((doc) => {
        list.push(doc.data() as SheetsSyncLog);
      });
      // Query already returns newest first; retain a defensive sort for stable UI.
      list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      callback(list);
    }, (error) => {
      console.warn('Sync logs snapshot subscription status:', error.message);
    });
    return unsub;
  }

  static async saveSyncLog(log: SheetsSyncLog): Promise<void> {
    await setDoc(doc(db, 'syncLogs', log.id), sanitizeForFirestore(log));
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
    return def;
  }

  static async saveSheetsConfig(config: any): Promise<void> {
    await setDoc(doc(db, 'settings', 'sheetsConfig'), sanitizeForFirestore(config));
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
      
      // S5-C: update only the shared scalar field. Do not read-modify-write
      // the whole sheetsConfig document.
      await updateDoc(doc(db, 'settings', 'sheetsConfig'), {
        lastSynced: timestamp
      });
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
      
      // S5-C: arrayUnion is atomic and idempotent for queue membership.
      // The stale local `includes` check is intentionally not authoritative.
      await updateDoc(doc(db, 'settings', 'sheetsConfig'), {
        syncQueue: arrayUnion(order.id)
      });
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

    await this.saveSyncLog(newLog);
    // S5-C: clear the queue and update lastSynced in one targeted document
    // write. This avoids whole-document replacement of shared settings.
    await updateDoc(doc(db, 'settings', 'sheetsConfig'), {
      syncQueue: [],
      lastSynced: timestamp
    });

    return { successCount: pendingCount, failed: false };
  }


}




