export type UserRole = 'ADMIN' | 'DEPUTY' | 'SUPERVISOR' | 'SELLER' | 'PUBLIC';

export type OrderStatus = 'PENDING' | 'DELIVERED' | 'DELAYED' | 'REJECTED';

export interface Seller {
  id: string;
  name: string;
  phone: string;
  active: boolean;
  createdAt: string;
  username?: string;
  email?: string;
  role?: 'SELLER' | 'SUPERVISOR' | 'DEPUTY' | 'ADMIN';
  parentId?: string; // Administrative leader id
  parentIds?: string[]; // Multiple administrative leader ids
  assignedProducts?: string[]; // For supervisors: products they are responsible for
  password?: string; // Stored password fallback for sellers
}

export interface Product {
  id: string;
  productName: string;
  wholesalePrice: number;
  sellingPrice: number;
  active: boolean;
  createdAt: string;
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
  product: string; // Product ID or Name
  deliveryCost: number;
  totalAmount: number;
  notes: string;
  orderStatus: OrderStatus;
  profit: number;
  createdBy: string; // e.g. "Admin" or a specific seller
  createdAt: string;
  updatedAt: string;
  assignedSupervisorId?: string; // Explicitly selected supervisor for sellers with multiple parents
}

export type Language = 'ar' | 'fr' | 'en';

export interface SheetsSyncLog {
  id: string;
  timestamp: string;
  action: string;
  status: 'SUCCESS' | 'FAILED' | 'RETRYING';
  details: string;
}

export interface AppNotification {
  id: string;
  timestamp: string;
  type: 'order_created' | 'order_deleted' | 'order_updated' | 'seller_created' | 'seller_updated' | 'seller_deleted';
  titleAr: string;
  titleFr: string;
  titleEn: string;
  detailsAr: string;
  detailsFr: string;
  detailsEn: string;
  creatorName: string;
}

