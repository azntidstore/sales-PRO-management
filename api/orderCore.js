export const MAX_ORDER_ITEMS = 50;

export function cleanString(value, max = 2000) {
  if (typeof value !== 'string') throw new Error('INVALID_STRING');
  const out = value.trim();
  if (!out || out.length > max) throw new Error('INVALID_STRING');
  return out;
}

export function money(value, max = 1_000_000_000) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) {
    throw new Error('INVALID_MONEY');
  }
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function quantity(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 1_000_000) {
    throw new Error('INVALID_QUANTITY');
  }
  return Math.round((value + Number.EPSILON) * 1000000) / 1000000;
}

export function normalizeItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > MAX_ORDER_ITEMS) {
    throw new Error('INVALID_ITEMS_COUNT');
  }
  const seen = new Set();
  return rawItems.map((raw) => {
    const productId = cleanString(raw?.productId, 256);
    if (seen.has(productId)) throw new Error('DUPLICATE_PRODUCT');
    seen.add(productId);
    return { productId, quantity: quantity(raw?.quantity) };
  });
}

export function buildTrustedItems(requestItems, productSnapshots) {
  return requestItems.map((item) => {
    const product = productSnapshots.get(item.productId);
    if (!product || product.active !== true) throw new Error('PRODUCT_NOT_AVAILABLE');
    const sellingPrice = money(product.sellingPrice);
    const wholesalePrice = money(product.wholesalePrice);
    const productName = cleanString(product.productName, 512);
    return {
      productId: item.productId,
      productNameSnapshot: productName,
      wholesalePriceSnapshot: wholesalePrice,
      sellingPriceSnapshot: sellingPrice,
      quantity: item.quantity,
    };
  });
}

export function calculateTrustedFinancials(items, deliveryCost, status) {
  const subtotal = items.reduce((sum, item) => sum + item.sellingPriceSnapshot * item.quantity, 0);
  const wholesale = items.reduce((sum, item) => sum + item.wholesalePriceSnapshot * item.quantity, 0);
  const totalAmount = Math.round((subtotal + deliveryCost + Number.EPSILON) * 100) / 100;
  const profit = status === 'DELIVERED'
    ? Math.round((subtotal - wholesale + Number.EPSILON) * 100) / 100
    : 0;
  return { totalAmount, profit };
}

export function assertOrderBasics(body) {
  const customerName = cleanString(body.customerName, 256);
  const phone = cleanString(body.phone, 64);
  const city = cleanString(body.city, 128);
  const address = cleanString(body.address || '', 1000);
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 4000) : '';
  const orderDate = typeof body.orderDate === 'string' && body.orderDate.trim()
    ? body.orderDate.trim().slice(0, 32)
    : new Date().toISOString().slice(0, 10);
  const deliveryCost = money(body.deliveryCost);
  const orderStatus = body.orderStatus || 'PENDING';
  if (!['PENDING', 'DELIVERED', 'DELAYED', 'REJECTED'].includes(orderStatus)) throw new Error('INVALID_ORDER_STATUS');
  return { customerName, phone, city, address, notes, orderDate, deliveryCost, orderStatus };
}
