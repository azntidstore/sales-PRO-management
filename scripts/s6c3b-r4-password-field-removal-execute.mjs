import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID;
const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const baselinePath = path.join(process.cwd(), 'artifacts', 's6c3b-r3-password-removal-dry-run.json');
const execute = process.argv.includes('--execute');

if (!projectId) throw new Error('FIREBASE_PROJECT_ID is required');
if (!credPath) throw new Error('GOOGLE_APPLICATION_CREDENTIALS is required');
if (!execute) throw new Error('REFUSED: explicit --execute is required; no production write was attempted');
if (!fs.existsSync(baselinePath)) throw new Error(`BASELINE_MISSING: ${baselinePath}`);

const credentialJson = JSON.parse(fs.readFileSync(credPath, 'utf8'));
if (!getApps().length) initializeApp({ credential: cert(credentialJson), projectId });
const db = getFirestore();

function normalizeForHash(value) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(normalizeForHash);
  if (typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = normalizeForHash(value[key]);
    return out;
  }
  return value;
}
function hashWithoutPassword(data) {
  const clone = { ...data };
  delete clone.password;
  const canonical = JSON.stringify(normalizeForHash(clone));
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
if (baseline?.protocol !== 'S6-C3-B-R3' || baseline?.operation !== 'PASSWORD_FIELD_REMOVAL_DRY_RUN') {
  throw new Error('BASELINE_INVALID: unexpected protocol/operation');
}
if (baseline?.mode !== 'READ_ONLY') throw new Error('BASELINE_INVALID: not a read-only R3 baseline');

const records = Array.isArray(baseline.records) ? baseline.records : [];
if (records.length !== baseline.passwordFieldCandidates) throw new Error('BASELINE_INVALID: record count mismatch');
if (baseline.totalSellerDocuments !== 14 || baseline.passwordFieldCandidates !== 14 || baseline.withoutPasswordField !== 0 || baseline.emptyPasswordFields !== 0 || baseline.nonStringPasswordFields !== 0) {
  throw new Error('BASELINE_INVALID: expected production target profile changed; aborting before writes');
}

const baselineById = new Map(records.map(r => [r.sellerId, r]));
const snap = await db.collection('sellers').get();
const docs = [...snap.docs].sort((a, b) => a.id.localeCompare(b.id));

if (docs.length !== baseline.totalSellerDocuments) throw new Error(`ABORT: SELLERS_COUNT_CHANGED baseline=${baseline.totalSellerDocuments} current=${docs.length}`);
if (docs.some(d => !baselineById.has(d.id)) || records.some(r => !snap.docs.some(d => d.id === r.sellerId))) {
  throw new Error('ABORT: seller ID set changed since baseline');
}

const preflight = [];
for (const d of docs) {
  const data = d.data();
  const base = baselineById.get(d.id);
  const currentHash = hashWithoutPassword(data);
  const passwordPresent = Object.prototype.hasOwnProperty.call(data, 'password');
  if (currentHash !== base.beforeHashExcludingPassword) {
    throw new Error(`ABORT: non-password document fingerprint changed sellerId=${d.id}`);
  }
  if (!passwordPresent) throw new Error(`ABORT: password field missing before execution sellerId=${d.id}`);
  if (typeof data.password !== 'string' || data.password.length === 0) throw new Error(`ABORT: password field metadata changed sellerId=${d.id}`);
  preflight.push({ id: d.id, ref: d.ref, updateTime: d.updateTime });
}

console.log('S6-C3-B-R4 PASSWORD FIELD REMOVAL EXECUTION');
console.log('MODE=EXPLICIT_EXECUTION');
console.log(`PROJECT_ID=${projectId}`);
console.log(`BASELINE=${baselinePath}`);
console.log(`TARGET_SELLERS=${preflight.length}`);
console.log('OPERATION=DELETE_FIELD_ONLY');
console.log('DOCUMENT_DELETES=0');
console.log('AUTH_MUTATIONS=0');
console.log('PASSWORD_VALUES_PRINTED=0');
console.log('PASSWORD_FINGERPRINTS_PRINTED=0');
console.log('PREFLIGHT=PASS');
console.log('WRITING=START');

let writes = 0;
for (const item of preflight) {
  await item.ref.update({ password: FieldValue.delete() }, { lastUpdateTime: item.updateTime });
  writes += 1;
  console.log(`UPDATED sellerId=${item.id} operation=DELETE_FIELD_ONLY`);
}

const verifySnap = await db.collection('sellers').get();
if (verifySnap.size !== docs.length) throw new Error(`RECONCILIATION_ABORT: seller count changed expected=${docs.length} actual=${verifySnap.size}`);
let remaining = 0;
for (const d of verifySnap.docs) {
  const data = d.data();
  if (Object.prototype.hasOwnProperty.call(data, 'password')) remaining += 1;
  const base = baselineById.get(d.id);
  if (!base || hashWithoutPassword(data) !== base.beforeHashExcludingPassword) {
    throw new Error(`RECONCILIATION_FAILED: non-password data changed sellerId=${d.id}`);
  }
}
if (remaining !== 0) throw new Error(`RECONCILIATION_FAILED: password fields remaining=${remaining}`);

const report = {
  protocol: 'S6-C3-B-R4',
  mode: 'EXPLICIT_EXECUTION',
  projectId,
  baselinePath,
  targetCount: preflight.length,
  firestoreWrites: writes,
  firestoreDeletes: 0,
  authMutations: 0,
  documentDeletes: 0,
  passwordValuesPrinted: 0,
  passwordFingerprintsPrinted: 0,
  reconciliation: 'PASS',
  remainingPasswordFields: remaining,
  completedAt: new Date().toISOString()
};
const outDir = path.join(process.cwd(), 'artifacts');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 's6c3b-r4-password-field-removal-execution.json');
fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(`FIRESTORE_WRITES=${writes}`);
console.log('FIRESTORE_DELETES=0');
console.log('AUTH_MUTATIONS=0');
console.log('REMAINING_PASSWORD_FIELDS=0');
console.log(`EXECUTION_REPORT=${outPath}`);
console.log('RESULT=EXECUTION_AND_RECONCILIATION_PASS');
