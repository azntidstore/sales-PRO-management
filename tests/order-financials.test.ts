import {
  calculateOrderItemsSubtotal,
  calculateExpectedMultiProductTotalAmount,
  calculateMultiProductOrderProfit,
  calculateOrderProfit,
  roundMoney,
  calculateExpectedTotalAmount,
} from '../src/utils/orderFinancials';

const cases = [
  { name: 'pending profit is zero', args: [10, 20, 2, 35, 75, 'PENDING'], expected: 0 },
  { name: 'delivered profit uses wholesale snapshot', args: [10, 20, 2, 35, 75, 'DELIVERED'], expected: 20 },
  { name: 'delivered profit supports decimal money', args: [12.5, 25.5, 2, 10.25, 61.25, 'DELIVERED'], expected: 26 },
  { name: 'rejected profit is zero', args: [10, 999, 2, 35, 75, 'REJECTED'], expected: 0 },
];

let failed = 0;
for (const test of cases) {
  const actual = calculateOrderProfit(...test.args as [number, number, number, number, number, string]);
  if (actual !== test.expected) {
    console.error(`[FAIL] ${test.name}: expected ${test.expected}, got ${actual}`);
    failed++;
  } else {
    console.log(`[PASS] ${test.name}`);
  }
}

const totalCases = [
  [20, 2, 35, 75],
  [25.5, 2, 10.25, 61.25],
  [0, 1, 0, 0],
];
for (const [selling, qty, delivery, expected] of totalCases) {
  const actual = calculateExpectedTotalAmount(selling, qty, delivery);
  if (actual !== expected) {
    console.error(`[FAIL] expected total ${selling}*${qty}+${delivery}: expected ${expected}, got ${actual}`);
    failed++;
  } else {
    console.log(`[PASS] expected total ${selling}*${qty}+${delivery}`);
  }
}

const roundingCases = [
  [10.005, 10.01],
  [10.004, 10],
  [0, 0],
];
for (const [input, expected] of roundingCases) {
  const actual = roundMoney(input);
  if (actual !== expected) {
    console.error(`[FAIL] roundMoney(${input}): expected ${expected}, got ${actual}`);
    failed++;
  } else {
    console.log(`[PASS] roundMoney(${input})`);
  }
}


const multiItems = [
  { productId: 'p1', productNameSnapshot: 'P1', wholesalePriceSnapshot: 10, sellingPriceSnapshot: 20, quantity: 2 },
  { productId: 'p2', productNameSnapshot: 'P2', wholesalePriceSnapshot: 11, sellingPriceSnapshot: 25.5, quantity: 3 },
];

const multiSubtotal = calculateOrderItemsSubtotal(multiItems);
if (multiSubtotal !== 116.5) {
  console.error(`[FAIL] multi-product subtotal: expected 116.5, got ${multiSubtotal}`);
  failed++;
} else {
  console.log('[PASS] multi-product subtotal');
}

const multiTotal = calculateExpectedMultiProductTotalAmount(multiItems, 35);
if (multiTotal !== 151.5) {
  console.error(`[FAIL] multi-product total: expected 151.5, got ${multiTotal}`);
  failed++;
} else {
  console.log('[PASS] multi-product total');
}

const multiProfitDelivered = calculateMultiProductOrderProfit(multiItems, 'DELIVERED');
if (multiProfitDelivered !== 63.5) {
  console.error(`[FAIL] multi-product delivered profit: expected 63.5, got ${multiProfitDelivered}`);
  failed++;
} else {
  console.log('[PASS] multi-product delivered profit');
}

const multiProfitPending = calculateMultiProductOrderProfit(multiItems, 'PENDING');
if (multiProfitPending !== 0) {
  console.error(`[FAIL] multi-product pending profit: expected 0, got ${multiProfitPending}`);
  failed++;
} else {
  console.log('[PASS] multi-product pending profit');
}

const duplicateItems = [...multiItems, { ...multiItems[0], productId: 'p1' }];
try {
  calculateOrderItemsSubtotal(duplicateItems);
  console.error('[FAIL] duplicate product IDs must be rejected');
  failed++;
} catch {
  console.log('[PASS] duplicate product IDs rejected');
}

if (failed) {
  console.error(`S3 financial unit tests: FAIL (${failed} failed)`);
  process.exitCode = 1;
} else {
  console.log(`S3 financial unit tests: PASS (multi-product financial cases included, 0 failed)`);
}
