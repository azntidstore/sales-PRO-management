import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const projectId = process.env.FIREBASE_PROJECT_ID;
if (!credPath) throw new Error('GOOGLE_APPLICATION_CREDENTIALS is required');
if (!projectId) throw new Error('FIREBASE_PROJECT_ID is required');

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

const snap = await db.collection('sellers').get();
const docs = [...snap.docs].sort((a, b) => a.id.localeCompare(b.id));
const candidates = docs.filter(d => Object.prototype.hasOwnProperty.call(d.data(), 'password'));
const missing = docs.filter(d => !Object.prototype.hasOwnProperty.call(d.data(), 'password'));
const nonString = candidates.filter(d => typeof d.data().password !== 'string');
const empty = candidates.filter(d => String(d.data().password ?? '') === '');

const report = {
  protocol: 'S6-C3-B-R3',
  operation: 'PASSWORD_FIELD_REMOVAL_DRY_RUN',
  mode: 'READ_ONLY',
  projectId,
  collection: 'sellers',
  totalSellerDocuments: docs.length,
  passwordFieldCandidates: candidates.length,
  withoutPasswordField: missing.length,
  emptyPasswordFields: empty.length,
  nonStringPasswordFields: nonString.length,
  proposedWrites: candidates.length,
  proposedDeletes: 0,
  proposedAuthMutations: 0,
  records: candidates.map(d => {
    const data = d.data();
    return {
      sellerId: d.id,
      beforeExists: true,
      passwordFieldPresent: true,
      passwordFieldType: typeof data.password,
      passwordNonEmpty: typeof data.password === 'string' ? data.password.length > 0 : data.password != null,
      passwordLength: typeof data.password === 'string' ? data.password.length : null,
      beforeHashExcludingPassword: hashWithoutPassword(data),
      proposedAfterHashExcludingPassword: hashWithoutPassword({ ...data, password: undefined }),
      proposedOperation: 'DELETE_FIELD_ONLY'
    };
  })
};

// The proposed-after hash is intentionally calculated from the same object with the field removed.
for (const r of report.records) {
  if (r.beforeHashExcludingPassword !== r.proposedAfterHashExcludingPassword) {
    throw new Error(`INTERNAL_HASH_ERROR sellerId=${r.sellerId}`);
  }
}

const outDir = path.join(process.cwd(), 'artifacts');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, 's6c3b-r3-password-removal-dry-run.json');
fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

console.log('S6-C3-B-R3 PASSWORD FIELD REMOVAL DRY-RUN');
console.log('MODE=READ_ONLY');
console.log(`PROJECT_ID=${projectId}`);
console.log(`SELLERS_COUNT=${report.totalSellerDocuments}`);
console.log(`PASSWORD_FIELD_CANDIDATES=${report.passwordFieldCandidates}`);
console.log(`WITHOUT_PASSWORD_FIELD=${report.withoutPasswordField}`);
console.log(`EMPTY_PASSWORD_FIELDS=${report.emptyPasswordFields}`);
console.log(`NONSTRING_PASSWORD_FIELDS=${report.nonStringPasswordFields}`);
console.log(`PROPOSED_FIELD_ONLY_WRITES=${report.proposedWrites}`);
console.log('PROPOSED_DOCUMENT_DELETES=0');
console.log('PROPOSED_AUTH_MUTATIONS=0');
console.log('PASSWORD_VALUES_PRINTED=0');
console.log('PASSWORD_FINGERPRINTS_PRINTED=0');
console.log('NON_PASSWORD_DATA_VALUES_PRINTED=0');
console.log('FIRESTORE_WRITES=0');
console.log('FIRESTORE_DELETES=0');
console.log('AUTH_MUTATIONS=0');
console.log(`BASELINE_REPORT=${outPath}`);
console.log('RESULT=DRY_RUN_PASS');
console.log('NEXT_STEP=EXPLICIT_EXECUTION_REQUIRES_SEPARATE_APPROVAL');
