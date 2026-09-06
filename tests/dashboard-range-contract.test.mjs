import fs from 'node:fs';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  where,
  orderBy,
} from 'firebase/firestore';

const rules = fs.readFileSync('firestore.rules', 'utf8');
const env = await initializeTestEnvironment({
  projectId: 'demo-seller-manager-dashboard-range',
  firestore: { rules },
});

const profiles = {
  adminUid: { uid: 'adminUid', sellerId: 'admin_1', role: 'ADMIN', active: true },
  deputyUid: { uid: 'deputyUid', sellerId: 'deputy_1', role: 'DEPUTY', active: true },
  seller1Uid: { uid: 'seller1Uid', sellerId: 'seller_1', role: 'SELLER', active: true },
  sup1Uid: { uid: 'sup1Uid', sellerId: 'sup_1', role: 'SUPERVISOR', active: true },
  sup2Uid: { uid: 'sup2Uid', sellerId: 'sup_2', role: 'SUPERVISOR', active: true },
};

const dbFor = (uid) => env.authenticatedContext(uid).firestore();

const order = (id, orderDate, sellerId, assignedSupervisorId) => ({
  id,
  orderDate,
  sellerId,
  assignedSupervisorId,
  sellerName: sellerId,
  customerName: id,
  quantity: 1,
  product: 'Product 1',
  productId: 'prod_1',
  productNameSnapshot: 'Product 1',
  wholesalePriceSnapshot: 10,
  sellingPriceSnapshot: 20,
  deliveryCost: 0,
  totalAmount: 20,
  profit: 10,
  orderStatus: 'DELIVERED',
  createdByUid: sellerId === 'seller_1' ? 'seller1Uid' : 'sup1Uid',
  createdAt: `${orderDate}T12:00:00.000Z`,
  updatedAt: `${orderDate}T12:00:00.000Z`,
});

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const profile of Object.values(profiles)) {
    await setDoc(doc(db, 'users', profile.uid), profile);
  }
  await setDoc(doc(db, 'sellers', 'seller_1'), { id: 'seller_1', name: 'Seller 1', active: true, role: 'SELLER', uid: 'seller1Uid', parentId: 'sup_1', parentIds: ['sup_1'] });
  await setDoc(doc(db, 'sellers', 'sup_1'), { id: 'sup_1', name: 'Supervisor 1', active: true, role: 'SUPERVISOR', uid: 'sup1Uid' });
  await setDoc(doc(db, 'sellers', 'sup_2'), { id: 'sup_2', name: 'Supervisor 2', active: true, role: 'SUPERVISOR', uid: 'sup2Uid' });

  const orders = [
    order('dash_today_seller', '2026-09-04', 'seller_1', 'sup_1'),
    order('dash_today_assigned', '2026-09-04', 'seller_other', 'sup_1'),
    order('dash_month_boundary', '2026-09-01', 'seller_1', 'sup_1'),
    order('dash_yesterday', '2026-09-03', 'seller_1', 'sup_1'),
    order('dash_prior_month', '2026-08-31', 'seller_1', 'sup_1'),
    order('dash_30d_start', '2026-08-07', 'seller_1', 'sup_1'),
    order('dash_30d_excluded', '2026-08-06', 'seller_1', 'sup_1'),
    order('dash_other_supervisor', '2026-09-04', 'seller_other', 'sup_2'),
    // This record belongs to the supervisor itself and intentionally also carries assignedSupervisorId,
    // so the two supervisor queries produce a duplicate that must be de-duplicated by document id.
    order('dash_supervisor_own', '2026-09-04', 'sup_1', 'sup_1'),
  ];
  for (const item of orders) await setDoc(doc(db, 'orders', item.id), item);
});

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

async function ids(snapshot) {
  return snapshot.docs.map((d) => d.id).sort();
}

for (const uid of ['adminUid', 'deputyUid']) {
  const db = dbFor(uid);
  await check(`${uid} today includes all today and excludes yesterday`, async () => {
    const snap = await assertSucceeds(getDocs(query(
      collection(db, 'orders'),
      where('orderDate', '>=', '2026-09-04'),
      where('orderDate', '<=', '2026-09-04'),
      orderBy('orderDate', 'desc'),
    )));
    const actual = await ids(snap);
    if (!actual.includes('dash_today_seller') || !actual.includes('dash_today_assigned') || !actual.includes('dash_supervisor_own') || actual.includes('dash_yesterday')) {
      throw new Error(`Unexpected today set: ${actual.join(',')}`);
    }
  });

  await check(`${uid} this_month includes month boundary and excludes prior month`, async () => {
    const snap = await assertSucceeds(getDocs(query(
      collection(db, 'orders'),
      where('orderDate', '>=', '2026-09-01'),
      where('orderDate', '<=', '2026-09-04'),
      orderBy('orderDate', 'desc'),
    )));
    const actual = await ids(snap);
    if (!actual.includes('dash_month_boundary') || actual.includes('dash_prior_month')) {
      throw new Error(`Unexpected month set: ${actual.join(',')}`);
    }
  });
}


await check('ADMIN last_30_days uses an exact 30-calendar-day inclusive range', async () => {
  const snap = await assertSucceeds(getDocs(query(
    collection(dbFor('adminUid'), 'orders'),
    where('orderDate', '>=', '2026-08-07'),
    where('orderDate', '<=', '2026-09-04'),
    orderBy('orderDate', 'desc'),
  )));
  const actual = await ids(snap);
  if (!actual.includes('dash_30d_start') || actual.includes('dash_30d_excluded')) {
    throw new Error(`Unexpected last-30-days set: ${actual.join(',')}`);
  }
});

await check('SELLER last_30_days remains seller-scoped', async () => {
  const snap = await assertSucceeds(getDocs(query(
    collection(dbFor('seller1Uid'), 'orders'),
    where('sellerId', '==', 'seller_1'),
    where('orderDate', '>=', '2026-08-07'),
    where('orderDate', '<=', '2026-09-04'),
    orderBy('orderDate', 'desc'),
  )));
  const actual = await ids(snap);
  if (actual.includes('dash_30d_excluded') || !actual.includes('dash_30d_start')) {
    throw new Error(`Unexpected seller last-30-days set: ${actual.join(',')}`);
  }
});

await check('SELLER today is seller-scoped', async () => {
  const snap = await assertSucceeds(getDocs(query(
    collection(dbFor('seller1Uid'), 'orders'),
    where('sellerId', '==', 'seller_1'),
    where('orderDate', '>=', '2026-09-04'),
    where('orderDate', '<=', '2026-09-04'),
    orderBy('orderDate', 'desc'),
  )));
  const actual = await ids(snap);
  if (actual.join(',') !== 'dash_today_seller') {
    throw new Error(`Unexpected seller set: ${actual.join(',')}`);
  }
});

await check('SELLER cannot replace scoped query with broad order query', () => assertFails(getDocs(query(
  collection(dbFor('seller1Uid'), 'orders'),
  where('orderDate', '>=', '2026-09-04'),
  where('orderDate', '<=', '2026-09-04'),
))));

await check('SUPERVISOR assigned-scope query excludes another supervisor', async () => {
  const snap = await assertSucceeds(getDocs(query(
    collection(dbFor('sup1Uid'), 'orders'),
    where('assignedSupervisorId', '==', 'sup_1'),
    where('orderDate', '>=', '2026-09-01'),
    where('orderDate', '<=', '2026-09-04'),
    orderBy('orderDate', 'desc'),
  )));
  const actual = await ids(snap);
  if (actual.includes('dash_other_supervisor')) throw new Error(`Leaked order: ${actual.join(',')}`);
});

await check('SUPERVISOR own-seller scope query succeeds', async () => {
  const snap = await assertSucceeds(getDocs(query(
    collection(dbFor('sup1Uid'), 'orders'),
    where('sellerId', '==', 'sup_1'),
    where('orderDate', '>=', '2026-09-01'),
    where('orderDate', '<=', '2026-09-04'),
    orderBy('orderDate', 'desc'),
  )));
  const actual = await ids(snap);
  if (!actual.includes('dash_supervisor_own')) throw new Error(`Missing own supervisor order: ${actual.join(',')}`);
});

await check('SUPERVISOR union requires document-id de-duplication', async () => {
  const db = dbFor('sup1Uid');
  const [assigned, own] = await Promise.all([
    getDocs(query(collection(db, 'orders'), where('assignedSupervisorId', '==', 'sup_1'), where('orderDate', '>=', '2026-09-01'), where('orderDate', '<=', '2026-09-04'), orderBy('orderDate', 'desc'))),
    getDocs(query(collection(db, 'orders'), where('sellerId', '==', 'sup_1'), where('orderDate', '>=', '2026-09-01'), where('orderDate', '<=', '2026-09-04'), orderBy('orderDate', 'desc'))),
  ]);
  const combined = [...assigned.docs, ...own.docs].map((d) => d.id);
  const unique = [...new Set(combined)];
  if (combined.filter((id) => id === 'dash_supervisor_own').length !== 2) {
    throw new Error(`Expected the test fixture to expose the same document in both scopes; got ${combined.join(',')}`);
  }
  if (unique.length >= combined.length) throw new Error(`Expected the raw union to contain a duplicate before de-duplication: ${combined.join(',')}`);
  if (unique.filter((id) => id === 'dash_supervisor_own').length !== 1) {
    throw new Error(`De-duplicated union lost or duplicated the supervisor-owned order: ${unique.join(',')}`);
  }
});

console.log(`Dashboard range contract tests: ${passed} passed, ${failed} failed`);
await env.cleanup();
if (failed > 0) process.exit(1);
