import assert from 'node:assert/strict';
import { calculateSessionAggregates, assertOpenSessionShape, assertSessionAggregates, cleanId } from '../api/sessionCore.js';

const rows = [
  { id: 'a', totalAmount: 120, profit: 20, orderStatus: 'DELIVERED' },
  { id: 'b', totalAmount: 80, profit: 10, orderStatus: 'PENDING' },
  { id: 'c', totalAmount: 50, profit: 5, orderStatus: 'REJECTED' },
];

assert.deepEqual(calculateSessionAggregates(rows), { orderCount: 3, totalSales: 250, totalProfit: 20 });
assert.throws(() => cleanId('bad id'), /INVALID_SESSION_ID/);
assertOpenSessionShape({ status: 'OPEN', sellerId: 'seller-1', openedAt: new Date().toISOString(), openedByUid: 'uid-1' });
assert.throws(() => assertOpenSessionShape({ status: 'CLOSED', sellerId: 'seller-1' }), /SESSION_NOT_OPEN/);
assertSessionAggregates({ orderCount: 3, totalSales: 250, totalProfit: 20 });
assert.throws(() => assertSessionAggregates({ orderCount: -1, totalSales: 0, totalProfit: 0 }), /INVALID_SESSION_AGGREGATE:orderCount/);
console.log('E3-G-C SESSION CORE: PASS (model invariants + server aggregate calculation + validation)');
