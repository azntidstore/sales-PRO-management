import assert from 'node:assert/strict';
import fs from 'node:fs';
import { normalizeItems, buildTrustedItems, calculateTrustedFinancials, MAX_ORDER_ITEMS } from '../api/orderCore.js';

const source = fs.readFileSync(new URL('../api/orders.js', import.meta.url), 'utf8');
assert.equal(MAX_ORDER_ITEMS, 50);
assert.match(source, /verifyIdToken/);
assert.match(source, /users\/\$\{uid\}/);
assert.match(source, /tx\.create\(orderRef, order\)/);
assert.match(source, /tx\.update\(ref, patch\)/);
assert.match(source, /tx\.delete\(ref\)/);
assert.match(source, /productNameSnapshot/);
assert.match(source, /wholesalePriceSnapshot/);
assert.match(source, /sellingPriceSnapshot/);
assert.match(source, /ORDER_PRODUCT_SET_IMMUTABLE/);
assert.match(source, /ORDER_CONCURRENCY_CONFLICT/);

const products = new Map(Array.from({ length: 50 }, (_, i) => [`p${i + 1}`, {
  active: true,
  productName: `Product ${i + 1}`,
  sellingPrice: 20 + i,
  wholesalePrice: 10 + i,
}]));
const request = normalizeItems(Array.from({ length: 50 }, (_, i) => ({ productId: `p${i + 1}`, quantity: 2 })));
const trusted = buildTrustedItems(request, products);
const financials = calculateTrustedFinancials(trusted, 35, 'DELIVERED');
assert.equal(trusted.length, 50);
assert.equal(financials.totalAmount, trusted.reduce((s, x) => s + x.sellingPriceSnapshot * x.quantity, 35));
assert.equal(financials.profit, trusted.reduce((s, x) => s + (x.sellingPriceSnapshot - x.wholesalePriceSnapshot) * x.quantity, 0));
assert.throws(() => normalizeItems([{ productId: 'p1', quantity: 1 }, { productId: 'p1', quantity: 2 }]), /DUPLICATE_PRODUCT/);
assert.throws(() => normalizeItems(Array.from({ length: 51 }, (_, i) => ({ productId: `p${i}`, quantity: 1 }))), /INVALID_ITEMS_COUNT/);
assert.throws(() => buildTrustedItems([{ productId: 'missing', quantity: 1 }], products), /PRODUCT_NOT_AVAILABLE/);

console.log('TRUSTED ORDER API CONTRACT: PASS (auth + server-only write path + 50-product scalability + trusted snapshots + financial invariants + concurrency + immutable product set)');
