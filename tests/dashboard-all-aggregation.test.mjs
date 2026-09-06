import fs from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, collection, query, where, getDocs, getAggregateFromServer, count, sum } from 'firebase/firestore';

const rules = fs.readFileSync('firestore.rules', 'utf8');
const env = await initializeTestEnvironment({ projectId: 'demo-seller-manager-s2', firestore: { rules } });
const dbFor = (uid) => env.authenticatedContext(uid).firestore();

const profiles = {
  adminUid: { uid: 'adminUid', sellerId: 'admin_1', name: 'Admin', role: 'ADMIN', active: true },
  deputyUid: { uid: 'deputyUid', sellerId: 'deputy_1', name: 'Deputy', role: 'DEPUTY', active: true },
  sup1Uid: { uid: 'sup1Uid', sellerId: 'sup_1', name: 'Supervisor 1', role: 'SUPERVISOR', active: true },
  sup2Uid: { uid: 'sup2Uid', sellerId: 'sup_2', name: 'Supervisor 2', role: 'SUPERVISOR', active: true },
  seller1Uid: { uid: 'seller1Uid', sellerId: 'seller_1', name: 'Seller 1', role: 'SELLER', active: true },
};

async function seed() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    for (const p of Object.values(profiles)) await setDoc(doc(db, 'users', p.uid), p);
    const orders = [
      { id: 'a', sellerId: 'sup_1', assignedSupervisorId: 'sup_1', orderStatus: 'PENDING', totalAmount: 100, profit: 20 },
      { id: 'b', sellerId: 'seller_2', assignedSupervisorId: 'sup_1', orderStatus: 'DELIVERED', totalAmount: 200, profit: 40 },
      { id: 'c', sellerId: 'seller_3', assignedSupervisorId: 'sup_1', orderStatus: 'REJECTED', totalAmount: 50, profit: 0 },
      { id: 'd', sellerId: 'seller_4', assignedSupervisorId: 'sup_2', orderStatus: 'DELAYED', totalAmount: 300, profit: 60 },
      { id: 'e', sellerId: 'seller_5', assignedSupervisorId: 'sup_2', orderStatus: 'DELIVERED', totalAmount: 400, profit: 80 },
    ];
    for (const o of orders) await setDoc(doc(db, 'orders', o.id), o);
  });
}

async function aggregate(db, uid, constraints = []) {
  const result = await getAggregateFromServer(
    query(collection(db, 'orders'), ...constraints),
    { orders: count(), totalSales: sum('totalAmount'), totalProfits: sum('profit') }
  );
  return result.data();
}

await seed();

const admin = dbFor('adminUid');
const deputy = dbFor('deputyUid');
const seller = dbFor('seller1Uid');
const sup1 = dbFor('sup1Uid');
const sup2 = dbFor('sup2Uid');

const adminResult = await assertSucceeds(aggregate(admin, 'adminUid'));
if (adminResult.orders !== 5 || adminResult.totalSales !== 1050 || adminResult.totalProfits !== 200) throw new Error('ADMIN aggregate mismatch');
console.log('[PASS] ADMIN aggregation count/sales/profit matches authoritative fixture');

const deputyResult = await assertSucceeds(aggregate(deputy, 'deputyUid'));
if (deputyResult.orders !== 5 || deputyResult.totalSales !== 1050 || deputyResult.totalProfits !== 200) throw new Error('DEPUTY aggregate mismatch');
console.log('[PASS] DEPUTY aggregation count/sales/profit matches authorized fixture');

const sellerResult = await assertSucceeds(aggregate(seller, 'seller1Uid', [where('sellerId', '==', 'seller_1')]));
if (sellerResult.orders !== 0 || sellerResult.totalSales !== 0 || sellerResult.totalProfits !== 0) throw new Error('SELLER aggregate mismatch');
console.log('[PASS] SELLER aggregation is seller-scoped');

await assertFails(aggregate(seller, 'seller1Uid'));
console.log('[PASS] SELLER broad aggregation is denied');

const assignedSnap = await assertSucceeds(getDocs(query(collection(sup1, 'orders'), where('assignedSupervisorId', '==', 'sup_1'))));
const ownSnap = await assertSucceeds(getDocs(query(collection(sup1, 'orders'), where('sellerId', '==', 'sup_1'))));
const supervisorUnion = new Map();
for (const snap of [...assignedSnap.docs, ...ownSnap.docs]) supervisorUnion.set(snap.id, snap.data());
let supervisorSales = 0;
let supervisorProfit = 0;
for (const order of supervisorUnion.values()) { supervisorSales += Number(order.totalAmount || 0); supervisorProfit += Number(order.profit || 0); }
if (supervisorUnion.size !== 3 || supervisorSales !== 350 || supervisorProfit !== 60) throw new Error('SUPERVISOR exact union mismatch');
console.log('[PASS] SUPERVISOR exact union uses two Rules-compatible scopes with document-id deduplication');

let supervisorPending = 0;
for (const order of supervisorUnion.values()) if (order.orderStatus === 'PENDING') supervisorPending += 1;
if (supervisorPending !== 1) throw new Error('SUPERVISOR status union mismatch');
console.log('[PASS] SUPERVISOR status aggregation remains exact after deduplication');

const sup2Result = await assertSucceeds(aggregate(sup2, 'sup2Uid', [where('assignedSupervisorId', '==', 'sup_2')]));
if (sup2Result.orders !== 2 || sup2Result.totalSales !== 700 || sup2Result.totalProfits !== 140) throw new Error('SUPERVISOR-2 scope mismatch');
console.log('[PASS] SUPERVISOR scope excludes another supervisor');

console.log('Dashboard ALL aggregation contract tests: 7 passed, 0 failed');
await env.cleanup();
