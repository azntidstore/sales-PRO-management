import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { GoogleAuth } from 'google-auth-library';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID;
const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const baselinePath = path.join(process.cwd(), 'artifacts', 's6c3b-r3-password-removal-dry-run.json');
const checkpointPath = path.join(process.cwd(), 'artifacts', 's6c3b-r4-r1-password-removal-checkpoint.json');
const reportPath = path.join(process.cwd(), 'artifacts', 's6c3b-r4-r1-password-removal-execution.json');
const execute = process.argv.includes('--execute');

if (!projectId) throw new Error('FIREBASE_PROJECT_ID is required');
if (!credPath) throw new Error('GOOGLE_APPLICATION_CREDENTIALS is required');
if (!execute) throw new Error('REFUSED: explicit --execute is required; no production write was attempted');
if (!fs.existsSync(baselinePath)) throw new Error(`BASELINE_MISSING: ${baselinePath}`);
if (!fs.existsSync(credPath)) throw new Error(`CREDENTIAL_FILE_MISSING: ${credPath}`);

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
function isQuotaError(error) {
  const text = `${error?.message || ''} ${error?.code || ''}`.toLowerCase();
  return text.includes('resource_exhausted') || text.includes('quota exceeded') || String(error?.code) === '8' || String(error?.code) === '429';
}
function isPreconditionError(error) {
  const text = `${error?.message || ''} ${error?.code || ''}`.toLowerCase();
  return text.includes('failed_precondition') || text.includes('precondition') || String(error?.code) === '9' || String(error?.code) === '412';
}

// Firestore REST currentDocument.updateTime must preserve the full stored
// timestamp precision. Timestamp#toDate().toISOString() truncates nanoseconds
// to milliseconds and can produce an invalid version precondition.
function firestoreTimestampToRfc3339(timestamp) {
  const seconds = Number(timestamp?.seconds);
  const nanoseconds = Number(timestamp?.nanoseconds);
  if (!Number.isFinite(seconds) || !Number.isInteger(nanoseconds) || nanoseconds < 0 || nanoseconds > 999999999) {
    throw new Error('INVALID_UPDATE_TIME');
  }
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) throw new Error('INVALID_UPDATE_TIME');
  const datePart = date.toISOString().slice(0, 19);
  if (nanoseconds === 0) return `${datePart}Z`;
  const fraction = String(nanoseconds).padStart(9, '0').replace(/0+$/, '');
  return `${datePart}.${fraction}Z`;
}

async function firestoreRestDeletePassword({ documentName, updateTime }) {
  const auth = new GoogleAuth({
    credentials: credentialJson,
    scopes: ['https://www.googleapis.com/auth/datastore']
  });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  const accessToken = typeof tokenResponse === 'string' ? tokenResponse : tokenResponse?.token;
  if (!accessToken) throw new Error('AUTH_TOKEN_UNAVAILABLE');

  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents:commit`;
  const body = {
    writes: [{
      update: { name: documentName, fields: {} },
      updateMask: { fieldPaths: ['password'] },
      currentDocument: { updateTime }
    }]
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await response.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* response body is not required for classification */ }
    if (!response.ok) {
      const error = new Error(parsed?.error?.message || `Firestore REST HTTP ${response.status}`);
      error.code = response.status;
      throw error;
    }
    if (parsed?.writeResults?.length !== 1) throw new Error('UNEXPECTED_COMMIT_RESPONSE');
    return parsed;
  } finally {
    clearTimeout(timer);
  }
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
if (docs.some(d => !baselineById.has(d.id)) || records.some(r => !snap.docs.some(d => d.id === r.sellerId))) throw new Error('ABORT: seller ID set changed since baseline');

const preflight = [];
for (const d of docs) {
  const data = d.data();
  const base = baselineById.get(d.id);
  const currentHash = hashWithoutPassword(data);
  if (currentHash !== base.beforeHashExcludingPassword) throw new Error(`ABORT: non-password document fingerprint changed sellerId=${d.id}`);
  if (!Object.prototype.hasOwnProperty.call(data, 'password')) throw new Error(`ABORT: password field missing before execution sellerId=${d.id}`);
  if (typeof data.password !== 'string' || data.password.length === 0) throw new Error(`ABORT: password field metadata changed sellerId=${d.id}`);
  preflight.push({ id: d.id, ref: d.ref, updateTime: d.updateTime, hash: currentHash });
}

let completedIds = new Set();
if (fs.existsSync(checkpointPath)) {
  const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
  if (checkpoint?.protocol !== 'S6-C3-B-R4-R1' || checkpoint?.baselinePath !== baselinePath || checkpoint?.projectId !== projectId) {
    throw new Error('CHECKPOINT_INVALID: incompatible checkpoint');
  }
  completedIds = new Set(Array.isArray(checkpoint.completedSellerIds) ? checkpoint.completedSellerIds : []);
  for (const id of completedIds) if (!baselineById.has(id)) throw new Error(`CHECKPOINT_INVALID: unknown sellerId=${id}`);
}

function writeCheckpoint() {
  const payload = {
    protocol: 'S6-C3-B-R4-R1',
    operation: 'PASSWORD_FIELD_REMOVAL_FIELD_ONLY',
    mode: 'EXPLICIT_EXECUTION',
    projectId,
    baselinePath,
    completedSellerIds: [...completedIds].sort(),
    firestoreWritesConfirmed: completedIds.size,
    updatedAt: new Date().toISOString()
  };
  fs.mkdirSync(path.dirname(checkpointPath), { recursive: true });
  fs.writeFileSync(checkpointPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

console.log('S6-C3-B-R4-R1 PASSWORD FIELD REMOVAL EXECUTION');
console.log('MODE=EXPLICIT_EXECUTION');
console.log(`PROJECT_ID=${projectId}`);
console.log(`BASELINE=${baselinePath}`);
console.log(`TARGET_SELLERS=${preflight.length}`);
console.log(`CHECKPOINT_COMPLETED=${completedIds.size}`);
console.log('OPERATION=DELETE_FIELD_ONLY');
console.log('TRANSPORT=FIRESTORE_REST_SINGLE_DOCUMENT');
console.log('AUTO_RETRY=DISABLED');
console.log('WRITE_TIMEOUT_MS=15000');
console.log('DOCUMENT_DELETES=0');
console.log('AUTH_MUTATIONS=0');
console.log('PASSWORD_VALUES_PRINTED=0');
console.log('PASSWORD_FINGERPRINTS_PRINTED=0');
console.log('PREFLIGHT=PASS');
console.log('WRITING=START');

let writesConfirmed = completedIds.size;
for (const item of preflight) {
  if (completedIds.has(item.id)) {
    console.log(`SKIP_ALREADY_COMPLETED sellerId=${item.id}`);
    continue;
  }
  try {
    await firestoreRestDeletePassword({
      documentName: `projects/${projectId}/databases/(default)/documents/${item.ref.path}`,
      updateTime: firestoreTimestampToRfc3339(item.updateTime)
    });
    completedIds.add(item.id);
    writesConfirmed += 1;
    writeCheckpoint();
    console.log(`UPDATED sellerId=${item.id} operation=DELETE_FIELD_ONLY`);
  } catch (error) {
    if (isQuotaError(error)) {
      writeCheckpoint();
      console.error('ABORT=RESOURCE_EXHAUSTED_QUOTA');
      console.error('NO_FURTHER_WRITES_ATTEMPTED');
      console.error(`COMPLETED_BEFORE_ABORT=${completedIds.size}`);
      process.exit(3);
    }
    if (isPreconditionError(error)) {
      const current = await item.ref.get();
      const data = current.data() || {};
      if (!Object.prototype.hasOwnProperty.call(data, 'password') && hashWithoutPassword(data) === item.hash) {
        completedIds.add(item.id);
        writesConfirmed += 1;
        writeCheckpoint();
        console.log(`CONFIRMED_AFTER_PRECONDITION sellerId=${item.id}`);
        continue;
      }
      throw new Error(`ABORT: precondition failed and document did not reconcile sellerId=${item.id}`);
    }
    if (error?.name === 'AbortError' || String(error?.message || '').includes('aborted')) {
      const current = await item.ref.get();
      const data = current.data() || {};
      if (!Object.prototype.hasOwnProperty.call(data, 'password') && hashWithoutPassword(data) === item.hash) {
        completedIds.add(item.id);
        writesConfirmed += 1;
        writeCheckpoint();
        console.log(`CONFIRMED_AFTER_TIMEOUT sellerId=${item.id}`);
        continue;
      }
    }
    writeCheckpoint();
    throw error;
  }
}

const verifySnap = await db.collection('sellers').get();
if (verifySnap.size !== docs.length) throw new Error(`RECONCILIATION_ABORT: seller count changed expected=${docs.length} actual=${verifySnap.size}`);
let remaining = 0;
for (const d of verifySnap.docs) {
  const data = d.data();
  if (Object.prototype.hasOwnProperty.call(data, 'password')) remaining += 1;
  const base = baselineById.get(d.id);
  if (!base || hashWithoutPassword(data) !== base.beforeHashExcludingPassword) throw new Error(`RECONCILIATION_FAILED: non-password data changed sellerId=${d.id}`);
}
if (remaining !== 0) throw new Error(`RECONCILIATION_FAILED: password fields remaining=${remaining}`);
if (completedIds.size !== preflight.length) throw new Error(`RECONCILIATION_FAILED: checkpoint completed=${completedIds.size} target=${preflight.length}`);

const report = {
  protocol: 'S6-C3-B-R4-R1',
  mode: 'EXPLICIT_EXECUTION',
  projectId,
  baselinePath,
  targetCount: preflight.length,
  firestoreWrites: writesConfirmed,
  firestoreDeletes: 0,
  authMutations: 0,
  documentDeletes: 0,
  passwordValuesPrinted: 0,
  passwordFingerprintsPrinted: 0,
  transport: 'FIRESTORE_REST_SINGLE_DOCUMENT',
  autoRetry: false,
  reconciliation: 'PASS',
  remainingPasswordFields: remaining,
  completedAt: new Date().toISOString()
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(`FIRESTORE_WRITES=${writesConfirmed}`);
console.log('FIRESTORE_DELETES=0');
console.log('AUTH_MUTATIONS=0');
console.log('REMAINING_PASSWORD_FIELDS=0');
console.log(`EXECUTION_REPORT=${reportPath}`);
console.log('RESULT=EXECUTION_AND_RECONCILIATION_PASS');
