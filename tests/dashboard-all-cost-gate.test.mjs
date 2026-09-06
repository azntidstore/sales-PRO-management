import fs from 'node:fs';
import { initializeTestEnvironment, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, collection, query, where, getDocs, limit, startAfter } from 'firebase/firestore';

const rules = fs.readFileSync('firestore.rules', 'utf8');
const env = await initializeTestEnvironment({ projectId: 'demo-seller-manager-s2', firestore: { rules } });
const dbFor = (uid) => env.authenticatedContext(uid).firestore();

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  await setDoc(doc(db, 'users', 'sup1Uid'), {
    uid: 'sup1Uid', sellerId: 'sup_1', name: 'Supervisor 1', role: 'SUPERVISOR', active: true,
  });
  // 205 assigned orders. The first 20 also belong to the supervisor seller scope.
  // 60 additional own-seller orders are not assigned to the supervisor.
  for (let i = 0; i < 205; i++) {
    await setDoc(doc(db, 'orders', `assigned_${String(i).padStart(3, '0')}`), {
      sellerId: i < 20 ? 'sup_1' : `seller_${i + 10}`,
      assignedSupervisorId: 'sup_1',
      orderStatus: i % 2 === 0 ? 'DELIVERED' : 'PENDING',
      totalAmount: 10,
      profit: 2,
    });
  }
  for (let i = 0; i < 60; i++) {
    await setDoc(doc(db, 'orders', `own_${String(i).padStart(3, '0')}`), {
      sellerId: 'sup_1',
      assignedSupervisorId: 'sup_2',
      orderStatus: 'DELIVERED',
      totalAmount: 5,
      profit: 1,
    });
  }
});

async function readPaged(db, field) {
  const seen = new Set();
  let cursor = null;
  let pages = 0;
  let returned = 0;
  while (true) {
    const constraints = [where(field, '==', 'sup_1'), limit(100)];
    if (cursor) constraints.push(startAfter(cursor));
    const snap = await assertSucceeds(getDocs(query(collection(db, 'orders'), ...constraints)));
    pages++;
    returned += snap.docs.length;
    for (const d of snap.docs) {
      if (seen.has(d.id)) throw new Error(`DUPLICATE_WITHIN_SCOPE:${field}:${d.id}`);
      seen.add(d.id);
    }
    if (snap.docs.length < 100) return { pages, returned, seen };
    cursor = snap.docs[snap.docs.length - 1];
  }
}

const sup = dbFor('sup1Uid');
const assigned = await readPaged(sup, 'assignedSupervisorId');
const own = await readPaged(sup, 'sellerId');

if (assigned.pages !== 3 || assigned.returned !== 205) throw new Error(`ASSIGNED_PAGING_MISMATCH:${JSON.stringify(assigned)}`);
console.log('[PASS] Supervisor assigned scope paginates 205 docs as 3 bounded queries');
if (own.pages !== 1 || own.returned !== 80) throw new Error(`OWN_PAGING_MISMATCH:${JSON.stringify(own)}`);
console.log('[PASS] Supervisor own-seller scope paginates 80 docs as 1 bounded query (60 exclusive + 20 overlap)');

const union = new Set([...assigned.seen, ...own.seen]);
if (union.size !== 265) throw new Error(`UNION_SIZE_MISMATCH:${union.size}`);
if (assigned.returned + own.returned !== 265 + 20) throw new Error('EXPECTED_OVERLAP_READ_AMPLIFICATION_MISMATCH');
console.log('[PASS] Cross-scope dedup removes exactly 20 overlapping documents');
console.log(`[INFO] SUPERVISOR_PAGES=${assigned.pages + own.pages}`);
console.log(`[INFO] SUPERVISOR_DOCUMENTS_RETURNED=${assigned.returned + own.returned}`);
console.log(`[INFO] SUPERVISOR_UNIQUE_DOCUMENTS=${union.size}`);
console.log('[PASS] Read amplification is bounded and measurable: 4 queries / 285 returned / 265 unique');

await env.cleanup();
