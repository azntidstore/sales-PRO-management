export type UserRole = 'ADMIN' | 'DEPUTY' | 'SUPERVISOR' | 'SELLER' | 'PUBLIC';

/**
 * A workspace is the operational context selected after authentication.
 * It is UI/session state only; Firestore authorization remains UID/profile based.
 */
export type WorkspaceRole = Exclude<UserRole, 'PUBLIC'>;

export interface RoleContext {
  role: WorkspaceRole;
  sellerId: string;
  parentId?: string;
  parentIds?: string[];
}

export interface AuthorizationProfile {
  uid: string;
  sellerId: string;
  name: string;
  role: WorkspaceRole;
  roles: WorkspaceRole[];
  roleContexts: RoleContext[];
  active: boolean;
}


export type AuthStatus =
  | 'checking'          // Initial verification of auth session (prevents UI flash)
  | 'unauthenticated'   // No active Firebase Auth session
  | 'loading_profile'   // Authenticated in Firebase Auth, retrieving Firestore profile
  | 'authenticated'     // Successfully authenticated and active profile loaded
  | 'profile_missing'   // Authenticated in Firebase Auth, but no corresponding seller profile found in Firestore
  | 'inactive'          // Authenticated, but seller account is deactivated (active: false)
  | 'auth_error';       // An error occurred during auth/profile verification

export type OrderStatus = 'PENDING' | 'DELIVERED' | 'DELAYED' | 'REJECTED';

/** Logical seller work session. CLOSED sessions are immutable archive boundaries. */
export type SettlementSessionStatus = 'OPEN' | 'CLOSED';

export interface SettlementInvoice {
  sessionId: string;
  sellerId: string;
  generatedAt: string;
  orderCount: number;
  deliveredOrderCount: number;
  totalSales: number;
  deliveredSales: number;
  totalProfit: number;
  settlementAmount: number;
}

export interface SettlementSession {
  id: string;
  sellerId: string;
  status: SettlementSessionStatus;
  openedAt: string;
  openedByUid: string;
  closedAt?: string;
  closedByUid?: string;
  orderCount: number;
  totalSales: number;
  totalProfit: number;
  /** Server-canonical amount to settle: delivered-order sales only. */
  settlementAmount: number;
  /** Immutable invoice snapshot generated when the session is closed. */
  invoice?: SettlementInvoice;
  updatedAt: string;
}

export interface Seller {
  id: string;
  name: string;
  phone: string;
  active: boolean;
  createdAt: string;
  username?: string;
  email?: string;
  role?: 'SELLER' | 'SUPERVISOR' | 'DEPUTY' | 'ADMIN';
  /** Optional multi-role declaration. Legacy `role` remains the primary role until S2-compatible Rules are upgraded. */
  roles?: Array<'SELLER' | 'SUPERVISOR' | 'DEPUTY' | 'ADMIN'>;
  parentId?: string; // Administrative leader id
  parentIds?: string[]; // Multiple administrative leader ids
  assignedProducts?: string[]; // For supervisors: products they are responsible for
  uid?: string; // Firebase Auth UID mapped to this seller profile
}

export interface Product {
  id: string;
  productName: string;
  wholesalePrice: number;
  sellingPrice: number;
  active: boolean;
  createdAt: string;
  /** Supervisor seller IDs authorized to see/manage this product. */
  supervisorIds?: string[];
  supervisorUids?: string[];
}

/**
 * Immutable product snapshot stored inside modern multi-product orders.
 * The snapshot preserves the commercial values that applied when the order was created.
 */
export interface OrderItem {
  productId: string;
  productNameSnapshot: string;
  wholesalePriceSnapshot: number;
  sellingPriceSnapshot: number;
  quantity: number;
}

export interface Order {
  id: string;
  orderDate: string; // ISO String or YYYY-MM-DD
  sellerName: string;
  customerName: string;
  phone: string;
  city: string;
  address: string;
  quantity: number;
  product: string; // Legacy display field; canonical identity is productId
  productId?: string;
  /** Modern orders use this bounded item list; legacy orders may omit it. */
  items?: OrderItem[];
  /** Denormalized product IDs used by Firestore Rules to enforce bounded item uniqueness. */
  productIds?: string[];
  productNameSnapshot?: string;
  wholesalePriceSnapshot?: number;
  sellingPriceSnapshot?: number;
  sellerNameSnapshot?: string;
  deliveryCost: number;
  totalAmount: number;
  notes: string;
  orderStatus: OrderStatus;
  profit: number;
  createdBy: string; // e.g. "Admin" or a specific seller
  /** Authorization linkage added during Phase S2; legacy orders may omit these until S3/S4 backfill. */
  sellerId?: string;
  createdByUid?: string;
  createdAt: string;
  updatedAt: string;
  assignedSupervisorId?: string; // Explicitly selected supervisor for sellers with multiple parents
  /** Immutable logical session/archive boundary. Modern orders may be linked once; legacy orders may omit it. */
  sessionId?: string;
}

export type Language = 'ar' | 'fr' | 'en';

export interface SheetsSyncLog {
  id: string;
  timestamp: string;
  action: string;
  status: 'SUCCESS' | 'FAILED' | 'RETRYING';
  details: string;
}
