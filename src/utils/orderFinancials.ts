import type { OrderItem, OrderStatus } from '../types';

/** Single source of truth for the modern order item bound. Kept below the
 * Firestore document-size ceiling while leaving room for future expansion. */
export const MAX_ORDER_ITEMS = 50;

/** Canonical monetary rounding used by the client and S3 tests. */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Validates the bounded modern order-item shape before financial calculation.
 * The trusted server API is the authoritative enforcement boundary; this client validation is only an early UX guard.
 */
export function isValidOrderItems(items: OrderItem[], maxItems = MAX_ORDER_ITEMS): boolean {
  if (!Array.isArray(items) || items.length < 1 || items.length > maxItems) return false;

  const ids = new Set<string>();
  for (const item of items) {
    if (!item || typeof item.productId !== 'string' || !item.productId) return false;
    if (ids.has(item.productId)) return false;
    ids.add(item.productId);

    if (typeof item.productNameSnapshot !== 'string' || !item.productNameSnapshot.trim()) return false;
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) return false;
    if (!Number.isFinite(item.sellingPriceSnapshot) || item.sellingPriceSnapshot < 0) return false;
    if (!Number.isFinite(item.wholesalePriceSnapshot) || item.wholesalePriceSnapshot < 0) return false;
  }

  return true;
}

/** Sum of selling-price snapshots multiplied by their quantities. */
export function calculateOrderItemsSubtotal(items: OrderItem[]): number {
  if (!isValidOrderItems(items)) {
    throw new Error('INVALID_ORDER_ITEMS');
  }
  return roundMoney(items.reduce(
    (sum, item) => sum + (item.sellingPriceSnapshot * item.quantity),
    0
  ));
}

/** Customer charge for a modern multi-product order. */
export function calculateExpectedMultiProductTotalAmount(
  items: OrderItem[],
  deliveryCost: number
): number {
  if (!Number.isFinite(deliveryCost) || deliveryCost < 0) {
    throw new Error('INVALID_DELIVERY_COST');
  }
  return roundMoney(calculateOrderItemsSubtotal(items) + deliveryCost);
}

/**
 * Realized profit for a modern multi-product order. Delivery is a pass-through
 * cost and therefore excluded from product margin. Non-delivered orders have
 * no realized profit.
 */
export function calculateMultiProductOrderProfit(
  items: OrderItem[],
  status: OrderStatus | string
): number {
  if (status !== 'DELIVERED') return 0;
  if (!isValidOrderItems(items)) {
    throw new Error('INVALID_ORDER_ITEMS');
  }

  return roundMoney(items.reduce(
    (sum, item) => sum + ((item.sellingPriceSnapshot - item.wholesalePriceSnapshot) * item.quantity),
    0
  ));
}

/** Canonical profit formula for legacy single-product orders. */
export function calculateOrderProfit(
  wholesalePriceSnapshot: number,
  _sellingPriceSnapshot: number,
  quantity: number,
  deliveryCost: number,
  totalAmount: number,
  status: OrderStatus | string
): number {
  if (status !== 'DELIVERED') return 0;
  return roundMoney(
    totalAmount - deliveryCost - (wholesalePriceSnapshot * quantity)
  );
}

/** Total customer charge expected from the selling-price snapshot plus delivery. */
export function calculateExpectedTotalAmount(
  sellingPriceSnapshot: number,
  quantity: number,
  deliveryCost: number
): number {
  return roundMoney((sellingPriceSnapshot * quantity) + deliveryCost);
}
