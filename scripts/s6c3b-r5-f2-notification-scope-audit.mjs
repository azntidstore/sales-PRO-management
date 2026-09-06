import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const SAMPLE_LIMIT = Math.min(Math.max(Number(process.env.S6C3B_F2_SAMPLE_LIMIT || 100), 20), 100);

if (!PROJECT_ID || !CREDENTIALS) {
  console.error('ERROR: FIREBASE_PROJECT_ID and GOOGLE_APPLICATION_CREDENTIALS are required.');
  process.exit(2);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(CREDENTIALS, 'utf8'));
} catch (err) {
  console.error(`ERROR: Cannot read credentials file: ${err?.message || String(err)}`);
  process.exit(2);
}

initializeApp({ credential: cert(serviceAccount), projectId: PROJECT_ID });
const db = getFirestore();

const sensitiveFieldNames = /password|token|secret|api.?key|credential|private.?key/i;
const recipientFieldNames = /^(uid|userId|recipientId|recipientUid|sellerId|recipientSellerId|targetSellerId|supervisorId|assignedSupervisorId|role|roles|parentId|parentIds|audience|scope|target)$/i;
const allowedNotificationTypes = new Set([
  'order_created','order_deleted','order_updated','seller_created','seller_updated','seller_deleted'
]);

const result = {
  mode: 'READ_ONLY',
  projectId: PROJECT_ID,
  sampleLimit: SAMPLE_LIMIT,
  valuesPrinted: 0,
  notificationTextPrinted: 0,
  sensitiveValuesPrinted: 0,
  firestoreWrites: 0,
  firestoreDeletes: 0,
  authMutations: 0
};

function typeOfValue(v) {
  if (v instanceof Timestamp) return 'timestamp';
  if (Array.isArray(v)) return `array(length=${v.length})`;
  if (v === null) return 'null';
  return typeof v;
}

function normalizedType(v) {
  return typeof v === 'string' ? v : '(non-string)';
}

const coll = db.collection('notifications');
const countSnap = await coll.count().get();
const totalCount = countSnap.data().count;
const sampleSnap = await coll.orderBy('timestamp', 'desc').limit(SAMPLE_LIMIT).get();

const fieldTypes = new Map();
const typeCounts = new Map();
const creatorFingerprints = new Set();
const recipientFields = new Set();
const suspiciousFields = new Set();
const malformed = [];
let minTs = null;
let maxTs = null;
let creatorFieldCount = 0;
let timestampFieldCount = 0;

for (const snap of sampleSnap.docs) {
  const data = snap.data();
  for (const [key, value] of Object.entries(data)) {
    if (!fieldTypes.has(key)) fieldTypes.set(key, new Set());
    fieldTypes.get(key).add(typeOfValue(value));
    if (recipientFieldNames.test(key)) recipientFields.add(key);
    if (sensitiveFieldNames.test(key)) suspiciousFields.add(key);
  }

  if (typeof data.type === 'string') {
    typeCounts.set(data.type, (typeCounts.get(data.type) || 0) + 1);
    if (!allowedNotificationTypes.has(data.type)) malformed.push('unexpected_type');
  } else {
    malformed.push('missing_or_nonstring_type');
  }

  if (typeof data.creatorName === 'string') {
    creatorFieldCount++;
    // Deliberately do not print creator values. Hashing would still be a
    // fingerprint, so only cardinality is reported.
    creatorFingerprints.add(data.creatorName);
  }

  if (typeof data.timestamp === 'string') {
    timestampFieldCount++;
    const t = Date.parse(data.timestamp);
    if (!Number.isNaN(t)) {
      minTs = minTs === null ? t : Math.min(minTs, t);
      maxTs = maxTs === null ? t : Math.max(maxTs, t);
    } else {
      malformed.push('invalid_timestamp');
    }
  }
}

function sortedObject(map) {
  return Object.fromEntries([...map.entries()].sort((a,b) => String(a[0]).localeCompare(String(b[0]))));
}

console.log('S6-C3-B-R5-F2 NOTIFICATION SCOPE AUDIT');
console.log('MODE=READ_ONLY');
console.log(`PROJECT_ID=${PROJECT_ID}`);
console.log(`TOTAL_NOTIFICATIONS=${totalCount}`);
console.log(`SAMPLE_DOCS=${sampleSnap.size}`);
console.log(`SAMPLE_LIMIT=${SAMPLE_LIMIT}`);
console.log('VALUES_PRINTED=0');
console.log('NOTIFICATION_TEXT_PRINTED=0');
console.log('SENSITIVE_VALUES_PRINTED=0');
console.log('');
console.log('[SCHEMA]');
console.log(`FIELDS=${[...fieldTypes.keys()].sort().map(k => `${k}{${[...fieldTypes.get(k)].sort().join('|')}}`).join(',') || '(none)'}`);
console.log(`RECIPIENT_OR_SCOPE_FIELDS=${[...recipientFields].sort().join(',') || '(none)'}`);
console.log(`SENSITIVE_FIELD_NAMES=${[...suspiciousFields].sort().join(',') || '(none)'}`);
console.log('');
console.log('[CONTENT_SHAPE]');
console.log(`TYPE_COUNTS=${JSON.stringify(sortedObject(typeCounts))}`);
console.log(`DISTINCT_CREATOR_COUNT_IN_SAMPLE=${creatorFingerprints.size}`);
console.log(`CREATOR_NAME_FIELD_PRESENT_COUNT=${creatorFieldCount}`);
console.log(`TIMESTAMP_FIELD_PRESENT_COUNT=${timestampFieldCount}`);
console.log(`TIMESTAMP_MIN=${minTs === null ? '(none)' : new Date(minTs).toISOString()}`);
console.log(`TIMESTAMP_MAX=${maxTs === null ? '(none)' : new Date(maxTs).toISOString()}`);
console.log(`MALFORMED_SHAPE_FINDINGS=${malformed.length ? [...new Set(malformed)].sort().join(',') : '(none)'}`);
console.log('');
console.log('[STATIC_AUTHORIZATION_REVIEW]');
console.log('RULES_CURRENT_READ_SCOPE=ANY_ACTIVE_AUTHENTICATED_ROLE');
console.log('CLIENT_VISIBLE_FILTERING=YES');
console.log('CLIENT_SIDE_FILTERING_IS_NOT_AUTHORIZATION=TRUE');
console.log('CURRENT_UI_FILTER_BASIS=ROLE_PLUS_CREATOR_NAME_PLUS_SELLER_HIERARCHY');
console.log('RECIPIENT_SCOPE_STORED_IN_NOTIFICATION_DOCUMENT=' + (recipientFields.size ? 'YES_OR_POSSIBLY' : 'NO_OBVIOUS_FIELD_IN_SAMPLE'));
console.log('CURRENT_LISTENER=ORDER_BY_TIMESTAMP_DESC_LIMIT_50_REALTIME');
console.log('READ_COST_REVIEW=REQUIRED');
console.log('');
console.log('[SAFETY]');
console.log(`FIRESTORE_WRITES=${result.firestoreWrites}`);
console.log(`FIRESTORE_DELETES=${result.firestoreDeletes}`);
console.log(`AUTH_MUTATIONS=${result.authMutations}`);
console.log('');
console.log('RESULT=READ_ONLY_PASS');
console.log('NEXT_STEP=REVIEW_FINDINGS_BEFORE_ANY_RULE_OR_SCHEMA_CHANGE');
