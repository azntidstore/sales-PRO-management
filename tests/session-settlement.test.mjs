import assert from 'node:assert/strict';
import { calculateSessionAggregates, buildSettlementInvoice, assertSessionAggregates } from '../api/sessionCore.js';

const orders = [
  { id:'a', totalAmount:120, orderStatus:'DELIVERED', profit:30 },
  { id:'b', totalAmount:80, orderStatus:'PENDING', profit:0 },
  { id:'c', totalAmount:50, orderStatus:'DELIVERED', profit:10 },
];
const a = calculateSessionAggregates(orders);
assert.deepEqual(a, { orderCount:3, deliveredOrderCount:2, totalSales:250, deliveredSales:170, totalProfit:40, settlementAmount:170 });
assertSessionAggregates(a);
const invoice = buildSettlementInvoice('sess1','seller1',a,'2026-09-05T20:00:00.000Z');
assert.equal(invoice.settlementAmount,170);
assert.equal(invoice.deliveredSales,170);
assert.equal(invoice.totalProfit,40);
assert.equal(invoice.orderCount,3);
assert.equal(invoice.deliveredOrderCount,2);
assert.equal(invoice.sessionId,'sess1');
assert.equal(invoice.sellerId,'seller1');
console.log('E3-G-E SETTLEMENT: PASS (delivered-sales settlement + invoice snapshot + canonical aggregates)');
