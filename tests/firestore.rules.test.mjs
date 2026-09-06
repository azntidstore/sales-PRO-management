import fs from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
} from 'firebase/firestore';

const rules = fs.readFileSync('firestore.rules', 'utf8');
const env = await initializeTestEnvironment({
  projectId: 'demo-seller-manager-s2',
  firestore: { rules },
});

const profiles = {
  adminUid: { uid: 'adminUid', sellerId: 'admin_1', name: 'Admin', role: 'ADMIN', active: true },
  deputyUid: { uid: 'deputyUid', sellerId: 'deputy_1', name: 'Deputy', role: 'DEPUTY', active: true },
  sup1Uid: { uid: 'sup1Uid', sellerId: 'sup_1', name: 'Supervisor 1', role: 'SUPERVISOR', active: true },
  sup2Uid: { uid: 'sup2Uid', sellerId: 'sup_2', name: 'Supervisor 2', role: 'SUPERVISOR', active: true },
  seller1Uid: { uid: 'seller1Uid', sellerId: 'seller_1', name: 'Seller 1', role: 'SELLER', active: true },
  dualUid: { uid: 'dualUid', sellerId: 'dual_1', name: 'Dual User', role: 'SELLER', roles: ['SELLER', 'SUPERVISOR'], active: true },
  seller2Uid: { uid: 'seller2Uid', sellerId: 'seller_2', name: 'Seller 2', role: 'SELLER', active: true },
  inactiveUid: { uid: 'inactiveUid', sellerId: 'seller_3', name: 'Inactive', role: 'SELLER', active: false },
};

const dbFor = (uid) => env.authenticatedContext(uid).firestore();
const anon = env.unauthenticatedContext().firestore();

const modernOrder = (overrides = {}) => ({
  id: 'ord_modern',
  orderDate: '2026-09-03',
  sellerName: 'Seller 1',
  sellerNameSnapshot: 'Seller 1',
  sellerId: 'seller_1',
  customerName: 'Modern',
  phone: '0600000000',
  city: 'Marrakesh',
  address: 'Test',
  quantity: 2,
  product: 'Product 1',
  productId: 'prod_1',
  productNameSnapshot: 'Product 1',
  wholesalePriceSnapshot: 10,
  sellingPriceSnapshot: 20,
  deliveryCost: 35,
  totalAmount: 75,
  notes: '',
  orderStatus: 'PENDING',
  profit: 0,
  createdBy: 'Seller 1',
  createdByUid: 'seller1Uid',
  assignedSupervisorId: 'sup_1',
  createdAt: '2026-09-03T00:00:00.000Z',
  updatedAt: '2026-09-03T00:00:00.000Z',
  ...overrides,
});

async function seed() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const p of Object.values(profiles)) await setDoc(doc(db, 'users', p.uid), p);
    await setDoc(doc(db, 'sellers', 'sup_1'), { id: 'sup_1', name: 'Supervisor 1', phone: '', active: true, role: 'SUPERVISOR', uid: 'sup1Uid' });
    await setDoc(doc(db, 'sellers', 'seller_1'), { id: 'seller_1', name: 'Seller 1', phone: '', active: true, role: 'SELLER', uid: 'seller1Uid', parentId: 'sup_1', parentIds: ['sup_1'] });
    await setDoc(doc(db, 'sellers', 'dual_1'), { id: 'dual_1', name: 'Dual User', phone: '', active: true, role: 'SELLER', uid: 'dualUid', parentId: 'sup_1', parentIds: ['sup_1'] });
    await setDoc(doc(db, 'sellers', 'dual_child_1'), { id: 'dual_child_1', name: 'Dual Child', phone: '', active: true, role: 'SELLER', uid: 'dualChildUid', parentId: 'dual_1', parentIds: ['dual_1'] });
    await setDoc(doc(db, 'sellers', 'seller_2'), { id: 'seller_2', name: 'Seller 2', phone: '', active: true, role: 'SELLER', uid: 'seller2Uid', parentId: 'sup_2', parentIds: ['sup_2'] });
    await setDoc(doc(db, 'products', 'prod_1'), { id: 'prod_1', productName: 'Product 1', wholesalePrice: 10, sellingPrice: 20, active: true, supervisorIds: ['sup_1'], supervisorUids: ['sup1Uid'] });
    await setDoc(doc(db, 'products', 'prod_2'), { id: 'prod_2', productName: 'Product 2', wholesalePrice: 11, sellingPrice: 22, active: true, supervisorIds: ['sup_2'], supervisorUids: ['sup2Uid'] });
    for (let i = 3; i <= 9; i++) {
      await setDoc(doc(db, 'products', `prod_${i}`), { id: `prod_${i}`, productName: `Product ${i}`, wholesalePrice: 10 + i, sellingPrice: 20 + i, active: true, supervisorIds: ['sup_1'], supervisorUids: ['sup1Uid'] });
    }
    await setDoc(doc(db, 'orders', 'ord_own'), { id: 'ord_own', sellerId: 'seller_1', sellerName: 'Seller 1', customerName: 'Own', createdByUid: 'seller1Uid' });
    await setDoc(doc(db, 'orders', 'ord_dual_own'), { id: 'ord_dual_own', sellerId: 'dual_1', sellerName: 'Dual User', customerName: 'Dual Own', createdByUid: 'dualUid' });
    await setDoc(doc(db, 'orders', 'ord_dual_managed'), { id: 'ord_dual_managed', sellerId: 'dual_child_1', sellerName: 'Dual Child', assignedSupervisorId: 'dual_1', customerName: 'Dual Managed', createdByUid: 'dualChildUid' });
    await setDoc(doc(db, 'orders', 'ord_assigned'), { id: 'ord_assigned', sellerId: 'seller_1', sellerName: 'Seller 1', assignedSupervisorId: 'sup_1', customerName: 'Assigned', createdByUid: 'seller1Uid' });
    await setDoc(doc(db, 'orders', 'ord_other'), { id: 'ord_other', sellerId: 'seller_2', sellerName: 'Seller 2', assignedSupervisorId: 'sup_2', customerName: 'Other', createdByUid: 'seller2Uid' });
    await setDoc(doc(db, 'orders', 'ord_legacy'), { id: 'ord_legacy', sellerName: 'Seller 1', customerName: 'Legacy', createdByUid: 'seller1Uid' });
    await setDoc(doc(db, 'orders', 'ord_modern'), modernOrder());
    await setDoc(doc(db, 'settings', 'main'), { id: 'main', value: 'x' });
    await setDoc(doc(db, 'syncLogs', 'log_1'), { id: 'log_1', timestamp: '2026-01-01T00:00:00Z' });
  });
}

let passed = 0;
let failed = 0;
async function check(label, fn) {
  try {
    await fn();
    console.log(`[PASS] ${label}`);
    passed++;
  } catch (error) {
    console.error(`[FAIL] ${label}`);
    console.error(error?.message || error);
    failed++;
  }
}

await seed();

await check('Anonymous cannot read products', () => assertFails(getDoc(doc(anon, 'products', 'prod_1'))));
await check('Anonymous cannot read orders', () => assertFails(getDoc(doc(anon, 'orders', 'ord_own'))));

for (const uid of ['adminUid', 'deputyUid', 'sup1Uid', 'seller1Uid']) {
  await check(`${uid} can read products`, () => assertSucceeds(getDoc(doc(dbFor(uid), 'products', 'prod_1'))));
}
await check('SUPERVISOR cannot read product assigned to another supervisor', () => assertFails(getDoc(doc(dbFor('sup1Uid'), 'products', 'prod_2'))));
await check('SUPERVISOR assignment query succeeds', () => assertSucceeds(getDocs(query(collection(dbFor('sup1Uid'), 'products'), where('supervisorUids', 'array-contains', 'sup1Uid')))));
await check('SUPERVISOR cannot query another supervisor UID scope', () => assertFails(getDocs(query(collection(dbFor('sup1Uid'), 'products'), where('supervisorUids', 'array-contains', 'sup2Uid')))));
await check('SUPERVISOR cannot change product supervisor assignment', () => assertFails(updateDoc(doc(dbFor('sup1Uid'), 'products', 'prod_1'), { supervisorIds: ['sup_2'], supervisorUids: ['sup2Uid'] })));
await check('SELLER cannot change product supervisor assignment', () => assertFails(updateDoc(doc(dbFor('seller1Uid'), 'products', 'prod_1'), { supervisorIds: ['sup_2'], supervisorUids: ['sup2Uid'] })));
await check('Inactive seller cannot read products', () => assertFails(getDoc(doc(dbFor('inactiveUid'), 'products', 'prod_1'))));

await check('SELLER reads own order', () => assertSucceeds(getDoc(doc(dbFor('seller1Uid'), 'orders', 'ord_own'))));
await check('SELLER cannot read another seller order', () => assertFails(getDoc(doc(dbFor('seller1Uid'), 'orders', 'ord_other'))));
await check('SELLER cannot read legacy order without sellerId', () => assertFails(getDoc(doc(dbFor('seller1Uid'), 'orders', 'ord_legacy'))));
await check('Missing assignedSupervisorId is safely handled', () => assertFails(getDoc(doc(dbFor('sup1Uid'), 'orders', 'ord_own'))));

await check('SELLER scoped sellerId query succeeds', () => assertSucceeds(getDocs(query(collection(dbFor('seller1Uid'), 'orders'), where('sellerId', '==', 'seller_1')))));
await check('SELLER broad order query is denied', () => assertFails(getDocs(query(collection(dbFor('seller1Uid'), 'orders')))));

await check('SUPERVISOR reads assigned order', () => assertSucceeds(getDoc(doc(dbFor('sup1Uid'), 'orders', 'ord_assigned'))));
await check('SUPERVISOR cannot read unassigned subordinate order', () => assertFails(getDoc(doc(dbFor('sup1Uid'), 'orders', 'ord_own'))));
await check('SUPERVISOR cannot read other supervisor order', () => assertFails(getDoc(doc(dbFor('sup1Uid'), 'orders', 'ord_other'))));
await check('SUPERVISOR cannot read legacy order', () => assertFails(getDoc(doc(dbFor('sup1Uid'), 'orders', 'ord_legacy'))));
await check('SUPERVISOR assignedSupervisorId query succeeds', () => assertSucceeds(getDocs(query(collection(dbFor('sup1Uid'), 'orders'), where('assignedSupervisorId', '==', 'sup_1')))));
await check('SUPERVISOR own-seller query succeeds', () => assertSucceeds(getDocs(query(collection(dbFor('sup1Uid'), 'orders'), where('sellerId', '==', 'sup_1')))));
await check('SUPERVISOR other assignedSupervisorId query denied', () => assertFails(getDocs(query(collection(dbFor('sup1Uid'), 'orders'), where('assignedSupervisorId', '==', 'sup_2')))));
await check('SUPERVISOR arbitrary sellerId query denied', () => assertFails(getDocs(query(collection(dbFor('sup1Uid'), 'orders'), where('sellerId', '==', 'seller_1')))));

await check('DUAL role can read own seller order', () => assertSucceeds(getDoc(doc(dbFor('dualUid'), 'orders', 'ord_dual_own'))));
await check('DUAL role can read managed supervisor order', () => assertSucceeds(getDoc(doc(dbFor('dualUid'), 'orders', 'ord_dual_managed'))));
await check('DUAL role cannot read another supervisor order', () => assertFails(getDoc(doc(dbFor('dualUid'), 'orders', 'ord_other'))));
await check('DUAL role seller-scoped query succeeds', () => assertSucceeds(getDocs(query(collection(dbFor('dualUid'), 'orders'), where('sellerId', '==', 'dual_1')))));
await check('DUAL role supervisor-scoped query succeeds', () => assertSucceeds(getDocs(query(collection(dbFor('dualUid'), 'orders'), where('assignedSupervisorId', '==', 'dual_1')))));
await check('DUAL role cannot query another supervisor scope', () => assertFails(getDocs(query(collection(dbFor('dualUid'), 'orders'), where('assignedSupervisorId', '==', 'sup_2')))));
await check('DUAL role can read managed seller', () => assertSucceeds(getDoc(doc(dbFor('dualUid'), 'sellers', 'dual_child_1'))));
await check('DUAL role can read own seller profile', () => assertSucceeds(getDoc(doc(dbFor('dualUid'), 'sellers', 'dual_1'))));
await check('DUAL role cannot read another supervisor seller', () => assertFails(getDoc(doc(dbFor('dualUid'), 'sellers', 'seller_2'))));

await check('SELLER cannot escalate seller role via set', () => assertFails(setDoc(doc(dbFor('seller1Uid'), 'sellers', 'seller_1'), { id: 'seller_1', name: 'Seller 1', phone: '', active: true, role: 'ADMIN', uid: 'seller1Uid' })));
await check('SELLER cannot escalate seller role via update', () => assertFails(updateDoc(doc(dbFor('seller1Uid'), 'sellers', 'seller_1'), { role: 'ADMIN' })));
await check('SELLER cannot reassign order sellerId', () => assertFails(updateDoc(doc(dbFor('seller1Uid'), 'orders', 'ord_own'), { sellerId: 'seller_2' })));
await check('SELLER cannot reassign order createdByUid', () => assertFails(updateDoc(doc(dbFor('seller1Uid'), 'orders', 'ord_own'), { createdByUid: 'seller2Uid' })));
await check('SELLER cannot delete order', () => assertFails(deleteDoc(doc(dbFor('seller1Uid'), 'orders', 'ord_own'))));

await check('SELLER can read own authorization profile', () => assertSucceeds(getDoc(doc(dbFor('seller1Uid'), 'users', 'seller1Uid'))));
await check('SELLER cannot read another authorization profile', () => assertFails(getDoc(doc(dbFor('seller1Uid'), 'users', 'adminUid'))));
await check('SELLER cannot change own authorization role', () => assertFails(updateDoc(doc(dbFor('seller1Uid'), 'users', 'seller1Uid'), { role: 'ADMIN' })));
await check('DUAL role can read own authorization profile', () => assertSucceeds(getDoc(doc(dbFor('dualUid'), 'users', 'dualUid'))));
await check('DUAL role cannot self-add ADMIN capability', () => assertFails(updateDoc(doc(dbFor('dualUid'), 'users', 'dualUid'), { roles: ['SELLER', 'SUPERVISOR', 'ADMIN'] })));
await check('DUAL role cannot self-add DEPUTY capability', () => assertFails(updateDoc(doc(dbFor('dualUid'), 'users', 'dualUid'), { roles: ['SELLER', 'SUPERVISOR', 'DEPUTY'] })));
await check('DUAL role cannot self-change primary role', () => assertFails(updateDoc(doc(dbFor('dualUid'), 'users', 'dualUid'), { role: 'ADMIN' })));
await check('SUPERVISOR can read managed seller', () => assertSucceeds(getDoc(doc(dbFor('sup1Uid'), 'sellers', 'seller_1'))));
await check('SUPERVISOR cannot read another supervisor seller', () => assertFails(getDoc(doc(dbFor('sup1Uid'), 'sellers', 'seller_2'))));
await check('SUPERVISOR cannot update another supervisor seller', () => assertFails(updateDoc(doc(dbFor('sup1Uid'), 'sellers', 'seller_2'), { name: 'Tampered' })));
await check('SELLER cannot write products', () => assertFails(updateDoc(doc(dbFor('seller1Uid'), 'products', 'prod_1'), { sellingPrice: 999 })));
await check('SELLER cannot delete products', () => assertFails(deleteDoc(doc(dbFor('seller1Uid'), 'products', 'prod_1'))));
await check('SUPERVISOR cannot create order for another supervisor', () => assertFails(setDoc(doc(dbFor('sup1Uid'), 'orders', 'ord_cross_create'), modernOrder({ id: 'ord_cross_create', sellerId: 'seller_2', sellerName: 'Seller 2', sellerNameSnapshot: 'Seller 2', createdByUid: 'sup1Uid', assignedSupervisorId: 'sup_2' }))));
await check('SUPERVISOR cannot directly create order for managed seller (server-only)', () => assertFails(setDoc(doc(dbFor('sup1Uid'), 'orders', 'ord_sup_create'), modernOrder({ id: 'ord_sup_create', customerName: 'Managed', createdByUid: 'sup1Uid', assignedSupervisorId: 'sup_1' }))));
await check('SUPERVISOR cannot update another supervisor order', () => assertFails(updateDoc(doc(dbFor('sup1Uid'), 'orders', 'ord_other'), { customerName: 'Tampered' })));
await check('SUPERVISOR cannot delete another supervisor order', () => assertFails(deleteDoc(doc(dbFor('sup1Uid'), 'orders', 'ord_other'))));
await check('SUPERVISOR can delete assigned order', () => assertSucceeds(deleteDoc(doc(dbFor('sup1Uid'), 'orders', 'ord_assigned'))));

await check('SELLER cannot update confirmed modern order', () => assertFails(updateDoc(doc(dbFor('seller1Uid'), 'orders', 'ord_modern'), { orderStatus: 'DELIVERED', profit: 20 })));
await check('SELLER cannot forge modern order profit', () => assertFails(updateDoc(doc(dbFor('seller1Uid'), 'orders', 'ord_modern'), { profit: 999 })));
await check('SELLER cannot change wholesale snapshot', () => assertFails(updateDoc(doc(dbFor('seller1Uid'), 'orders', 'ord_modern'), { wholesalePriceSnapshot: 1 })));
await check('SELLER cannot create order with forged product snapshot', () => assertFails(setDoc(doc(dbFor('seller1Uid'), 'orders', 'ord_forged_snapshot'), modernOrder({ id: 'ord_forged_snapshot', orderStatus: 'DELIVERED', profit: 999, wholesalePriceSnapshot: 1 }))));
await check('SELLER cannot directly create order with valid product snapshot (server-only)', () => assertFails(setDoc(doc(dbFor('seller1Uid'), 'orders', 'ord_valid_create'), modernOrder({ id: 'ord_valid_create', customerName: 'Valid create', createdByUid: 'seller1Uid' }))));
const multiItems8 = Array.from({ length: 8 }, (_, index) => ({
  productId: `prod_${index + 1}`,
  productNameSnapshot: `Product ${index + 1}`,
  wholesalePriceSnapshot: 10 + index + 1,
  sellingPriceSnapshot: 20 + index + 1,
  quantity: index + 1,
}));
const multiSubtotal8 = multiItems8.reduce((sum, item) => sum + item.sellingPriceSnapshot * item.quantity, 0);
const multiProfit8 = multiItems8.reduce((sum, item) => sum + (item.sellingPriceSnapshot - item.wholesalePriceSnapshot) * item.quantity, 0);
const multiItems9 = [...multiItems8, { productId: 'prod_9', productNameSnapshot: 'Product 9', wholesalePriceSnapshot: 19, sellingPriceSnapshot: 29, quantity: 9 }];

await check('SELLER cannot directly create valid 8-product order (server-only)', () => assertFails(setDoc(doc(dbFor('seller1Uid'), 'orders', 'ord_multi8'), modernOrder({
  id: 'ord_multi8',
  items: multiItems8,
  productIds: multiItems8.map(item => item.productId),
  totalAmount: multiSubtotal8 + 21,
  profit: 0,
}))))
await check('SELLER cannot create 9-product order', () => assertFails(setDoc(doc(dbFor('seller1Uid'), 'orders', 'ord_multi9'), modernOrder({
  id: 'ord_multi9',
  items: multiItems9,
  productIds: multiItems9.map(item => item.productId),
  totalAmount: multiItems9.reduce((sum, item) => sum + item.sellingPriceSnapshot * item.quantity, 0) + 21,
  profit: 0,
}))))
await check('SELLER cannot create 10-product order', () => assertFails(setDoc(doc(dbFor('seller1Uid'), 'orders', 'ord_multi10'), modernOrder({
  id: 'ord_multi10',
  items: [...multiItems9, { productId: 'prod_1', productNameSnapshot: 'Product 1', wholesalePriceSnapshot: 11, sellingPriceSnapshot: 21, quantity: 1 }],
  productIds: [...multiItems8.map(item => item.productId), 'prod_1'],
  totalAmount: 999,
  profit: 0,
}))))
await check('SELLER cannot create duplicate-product order', () => assertFails(setDoc(doc(dbFor('seller1Uid'), 'orders', 'ord_multi_dup'), modernOrder({
  id: 'ord_multi_dup',
  items: [multiItems8[0], multiItems8[0]],
  productIds: ['prod_1', 'prod_1'],
  totalAmount: 42 + 35,
  profit: 0,
}))));
await check('SELLER cannot mismatch productIds and items', () => assertFails(setDoc(doc(dbFor('seller1Uid'), 'orders', 'ord_multi_mismatch'), modernOrder({
  id: 'ord_multi_mismatch',
  items: [multiItems8[0], multiItems8[1]],
  productIds: ['prod_1', 'prod_9'],
  totalAmount: 21 + 22 + 35,
  profit: 0,
}))));
await check('SELLER cannot forge multi-product snapshot', () => assertFails(setDoc(doc(dbFor('seller1Uid'), 'orders', 'ord_multi_forged'), modernOrder({
  id: 'ord_multi_forged',
  items: [
    { productId: 'prod_1', productNameSnapshot: 'Product 1', wholesalePriceSnapshot: 999, sellingPriceSnapshot: 21, quantity: 1 },
    { productId: 'prod_2', productNameSnapshot: 'Product 2', wholesalePriceSnapshot: 12, sellingPriceSnapshot: 22, quantity: 1 },
  ],
  productIds: ['prod_1', 'prod_2'],
  totalAmount: 78,
  profit: 0,
}))));
await check('SELLER cannot forge multi-product total', () => assertFails(updateDoc(doc(dbFor('seller1Uid'), 'orders', 'ord_multi8'), { totalAmount: 1 } )));
await check('SELLER cannot update confirmed multi-product order', () => assertFails(updateDoc(doc(dbFor('seller1Uid'), 'orders', 'ord_multi8'), { items: [multiItems9[0]], totalAmount: 56, profit: 0 })));
await check('ADMIN cannot directly update multi-product order (server-only)', () => assertFails(updateDoc(doc(dbFor('adminUid'), 'orders', 'ord_multi8'), { orderStatus: 'DELIVERED', profit: multiProfit8 })));
await check('ADMIN cannot directly update multi-product quantities with consistent financials (server-only)', () => assertFails(updateDoc(doc(dbFor('adminUid'), 'orders', 'ord_multi8'), { items: multiItems8.map((item, i) => i === 0 ? { ...item, quantity: 2 } : item), productIds: multiItems8.map(item => item.productId), totalAmount: multiSubtotal8 + 21 + 35, profit: multiProfit8 + 10 })));
await check('ADMIN cannot forge multi-product profit', () => assertFails(updateDoc(doc(dbFor('adminUid'), 'orders', 'ord_multi8'), { profit: 999 })));
await check('ADMIN cannot change multi-product snapshots', () => assertFails(updateDoc(doc(dbFor('adminUid'), 'orders', 'ord_multi8'), { items: multiItems8.map((item, i) => i === 0 ? { ...item, sellingPriceSnapshot: 999 } : item) })));
await check('ADMIN cannot remove items from multi-product order', () => assertFails(updateDoc(doc(dbFor('adminUid'), 'orders', 'ord_multi8'), { items: null, productId: 'prod_1', productNameSnapshot: 'Product 1', wholesalePriceSnapshot: 11, sellingPriceSnapshot: 21, quantity: 1, totalAmount: 56, profit: 0 })));

await check('ADMIN can change product price without changing historical order snapshot', () => assertSucceeds(updateDoc(doc(dbFor('adminUid'), 'products', 'prod_1'), { wholesalePrice: 15, sellingPrice: 25 })));
await check('ADMIN cannot directly update modern order (server-only)', () => assertFails(updateDoc(doc(dbFor('adminUid'), 'orders', 'ord_modern'), { orderStatus: 'DELIVERED', profit: 20 })));
await check('ADMIN cannot forge historical wholesale snapshot on same product', () => assertFails(updateDoc(doc(dbFor('adminUid'), 'orders', 'ord_modern'), { wholesalePriceSnapshot: 15, profit: 10 })));

await check('ADMIN cannot directly create order only with current product snapshots (server-only)', () => assertFails(setDoc(doc(dbFor('adminUid'), 'orders', 'ord_admin_valid'), modernOrder({ id: 'ord_admin_valid', createdByUid: 'adminUid', wholesalePriceSnapshot: 15, sellingPriceSnapshot: 25, totalAmount: 85, profit: 0 }))));
await check('ADMIN cannot create order with stale product snapshot', () => assertFails(setDoc(doc(dbFor('adminUid'), 'orders', 'ord_admin_stale'), modernOrder({ id: 'ord_admin_stale', createdByUid: 'adminUid' }))));

await check('SELLER cannot forge totalAmount', () => assertFails(updateDoc(doc(dbFor('seller1Uid'), 'orders', 'ord_modern'), { totalAmount: 999, profit: 944 })));
await check('SELLER cannot change selling snapshot on same product', () => assertFails(updateDoc(doc(dbFor('seller1Uid'), 'orders', 'ord_modern'), { sellingPriceSnapshot: 999, profit: 1978 })));
await check('SELLER cannot change productId on existing modern order', () => assertFails(updateDoc(doc(dbFor('seller1Uid'), 'orders', 'ord_modern'), { productId: 'prod_other', productNameSnapshot: 'Other', wholesalePriceSnapshot: 1, sellingPriceSnapshot: 2, totalAmount: 39, profit: 37 })));
await check('ADMIN cannot directly update quantity with consistent total and derived profit (server-only)', () => assertFails(updateDoc(doc(dbFor('adminUid'), 'orders', 'ord_modern'), { quantity: 3, totalAmount: 95, orderStatus: 'DELIVERED', profit: 30 })));
await check('ADMIN cannot forge totalAmount against selling snapshot', () => assertFails(updateDoc(doc(dbFor('adminUid'), 'orders', 'ord_modern'), { totalAmount: 999, profit: 964 })));

await check('ADMIN can read settings', () => assertSucceeds(getDoc(doc(dbFor('adminUid'), 'settings', 'main'))));
await check('DEPUTY can read settings', () => assertSucceeds(getDoc(doc(dbFor('deputyUid'), 'settings', 'main'))));
await check('SUPERVISOR cannot read settings', () => assertFails(getDoc(doc(dbFor('sup1Uid'), 'settings', 'main'))));
await check('SELLER cannot read settings', () => assertFails(getDoc(doc(dbFor('seller1Uid'), 'settings', 'main'))));
await check('ADMIN can read syncLogs', () => assertSucceeds(getDoc(doc(dbFor('adminUid'), 'syncLogs', 'log_1'))));
await check('DEPUTY can read syncLogs', () => assertSucceeds(getDoc(doc(dbFor('deputyUid'), 'syncLogs', 'log_1'))));
await check('SUPERVISOR cannot read syncLogs', () => assertFails(getDoc(doc(dbFor('sup1Uid'), 'syncLogs', 'log_1'))));

await env.cleanup();

if (failed > 0) {
  console.error(`S2 Firestore authorization tests: FAIL (${passed} passed, ${failed} failed)`);
  process.exitCode = 1;
} else {
  console.log(`S2 Firestore authorization tests: PASS (${passed} passed, 0 failed)`);
}
