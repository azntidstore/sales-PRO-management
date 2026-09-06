import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { collection, doc, setDoc, getDoc, getDocs, query, where } from 'firebase/firestore';
import fs from 'node:fs';

const rules = fs.readFileSync(new URL('../firestore.rules.E1-R4-DIAGNOSTIC', import.meta.url), 'utf8');
const env = await initializeTestEnvironment({
  projectId: 'e1-r4-diagnostic',
  firestore: { rules },
});

const db = env.authenticatedContext('sup1Uid').firestore();
const admin = env.unauthenticatedContext().firestore();

await env.withSecurityRulesDisabled(async (ctx) => {
  const d = ctx.firestore();
  await setDoc(doc(d, 'diagA', 'p1'), { supervisorUids: ['sup1Uid'] });
  await setDoc(doc(d, 'diagA', 'p2'), { supervisorUids: ['sup2Uid'] });
  await setDoc(doc(d, 'diagB', 'p1'), { supervisorUids: ['sup1Uid'] });
  await setDoc(doc(d, 'diagB', 'p2'), { supervisorUids: ['sup2Uid'] });
  await setDoc(doc(d, 'diagC', 'p1'), { supervisorUids: ['sup1Uid'] });
  await setDoc(doc(d, 'diagC', 'p2'), { supervisorUids: ['sup2Uid'] });
  await setDoc(doc(d, 'diagD', 'p1'), { supervisorUid: 'sup1Uid' });
  await setDoc(doc(d, 'diagD', 'p2'), { supervisorUid: 'sup2Uid' });
});

async function check(name, fn) {
  try { await fn(); console.log(`[PASS] ${name}`); }
  catch (e) { console.log(`[FAIL] ${name}`); console.log(`       ${e.message}`); }
}

await check('A direct read', () => assertSucceeds(getDoc(doc(db, 'diagA', 'p1'))));
await check('A array-contains query', () => assertSucceeds(getDocs(query(collection(db, 'diagA'), where('supervisorUids', 'array-contains', 'sup1Uid')))));
await check('B direct read', () => assertSucceeds(getDoc(doc(db, 'diagB', 'p1'))));
await check('B array-contains query', () => assertSucceeds(getDocs(query(collection(db, 'diagB'), where('supervisorUids', 'array-contains', 'sup1Uid')))));
await check('C direct read', () => assertSucceeds(getDoc(doc(db, 'diagC', 'p1'))));
await check('C array-contains query', () => assertSucceeds(getDocs(query(collection(db, 'diagC'), where('supervisorUids', 'array-contains', 'sup1Uid')))));
await check('D direct read', () => assertSucceeds(getDoc(doc(db, 'diagD', 'p1'))));
await check('D equality query', () => assertSucceeds(getDocs(query(collection(db, 'diagD'), where('supervisorUid', '==', 'sup1Uid')))));
await check('B wrong UID query denied', () => assertFails(getDocs(query(collection(db, 'diagB'), where('supervisorUids', 'array-contains', 'sup2Uid')))));

await env.cleanup();
