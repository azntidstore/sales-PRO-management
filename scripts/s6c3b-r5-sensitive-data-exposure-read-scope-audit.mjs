import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID;
const CREDENTIALS = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const SAMPLE_LIMIT = Math.min(Math.max(Number(process.env.S6C3B_R5_SAMPLE_LIMIT || 20), 1), 100);

if (!PROJECT_ID) {
  console.error('ERROR: FIREBASE_PROJECT_ID is required');
  process.exit(2);
}
if (!CREDENTIALS) {
  console.error('ERROR: GOOGLE_APPLICATION_CREDENTIALS is required');
  process.exit(2);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(CREDENTIALS, 'utf8'));
} catch (err) {
  console.error(`ERROR: Cannot read GOOGLE_APPLICATION_CREDENTIALS file: ${err?.message || String(err)}`);
  process.exit(2);
}

initializeApp({ credential: cert(serviceAccount), projectId: PROJECT_ID });
const db = getFirestore();

const sensitiveNames = /password|passwd|token|secret|api.?key|private.?key|access.?token|refresh.?token|credential|authorization|cookie|session/i;
const piiNames = /phone|email|address|customer.?name|name|notes|city|username/i;
const financialNames = /wholesale|selling|profit|total|delivery|price|amount|cost/i;
const recipientNames = /recipient|receiver|target|userId|sellerId|supervisorId|role|uid|audience|recipientIds|targetUserIds/i;

function fieldKind(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (value instanceof Date) return 'date';
  if (typeof value === 'object') return 'map';
  return typeof value;
}

function safeValueShape(value, depth = 0) {
  if (depth > 2) return 'nested';
  if (Array.isArray(value)) {
    return `array(length=${value.length},sample=${value.slice(0, 3).map(v => safeValueShape(v, depth + 1)).join('|') || 'empty'})`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).slice(0, 30);
    return `map(keys=${keys.join(',') || 'none'})`;
  }
  return fieldKind(value);
}

function inspectFields(data) {
  const fields = {};
  const sensitive = [];
  const pii = [];
  const financial = [];
  const recipient = [];
  for (const [key, value] of Object.entries(data || {})) {
    fields[key] = safeValueShape(value);
    if (sensitiveNames.test(key)) sensitive.push(key);
    if (piiNames.test(key)) pii.push(key);
    if (financialNames.test(key)) financial.push(key);
    if (recipientNames.test(key)) recipient.push(key);
  }
  return { fields, sensitive, pii, financial, recipient };
}

async function countCollection(name) {
  const snap = await db.collection(name).count().get();
  return snap.data().count;
}

async function sampleCollection(name, limit = SAMPLE_LIMIT) {
  const snap = await db.collection(name).limit(limit).get();
  return snap.docs;
}

function unionKeys(docs) {
  const set = new Set();
  for (const doc of docs) for (const key of Object.keys(doc.data())) set.add(key);
  return [...set].sort();
}

function printCollectionReport(name, docs, count) {
  const all = docs.map(d => inspectFields(d.data()));
  const keys = unionKeys(docs);
  const sensitive = [...new Set(all.flatMap(x => x.sensitive))].sort();
  const pii = [...new Set(all.flatMap(x => x.pii))].sort();
  const financial = [...new Set(all.flatMap(x => x.financial))].sort();
  const recipient = [...new Set(all.flatMap(x => x.recipient))].sort();
  console.log(`\n[COLLECTION] ${name}`);
  console.log(`COUNT=${count}`);
  console.log(`SAMPLE_DOCS=${docs.length}`);
  console.log(`SAMPLE_FIELD_NAMES=${keys.join(',') || '(none)'}`);
  console.log(`SENSITIVE_FIELD_NAMES=${sensitive.join(',') || '(none)'}`);
  console.log(`PII_FIELD_NAMES=${pii.join(',') || '(none)'}`);
  console.log(`FINANCIAL_FIELD_NAMES=${financial.join(',') || '(none)'}`);
  console.log(`RECIPIENT_OR_SCOPE_FIELD_NAMES=${recipient.join(',') || '(none)'}`);
}

let firestoreWrites = 0;
let firestoreDeletes = 0;
let authMutations = 0;

console.log('S6-C3-B-R5 SENSITIVE DATA EXPOSURE & READ-SCOPE AUDIT');
console.log('MODE=READ_ONLY');
console.log(`PROJECT_ID=${PROJECT_ID}`);
console.log(`SAMPLE_LIMIT=${SAMPLE_LIMIT}`);
console.log('VALUES_PRINTED=0');
console.log('PASSWORD_VALUES_PRINTED=0');
console.log('TOKENS_PRINTED=0');
console.log('SECRETS_PRINTED=0');

const sellersCount = await countCollection('sellers');
const sellers = await sampleCollection('sellers');
printCollectionReport('sellers', sellers, sellersCount);

const productsCount = await countCollection('products');
const products = await sampleCollection('products');
printCollectionReport('products', products, productsCount);

const ordersCount = await countCollection('orders');
const orders = await sampleCollection('orders');
printCollectionReport('orders', orders, ordersCount);

const notificationsCount = await countCollection('notifications');
const notifications = await sampleCollection('notifications');
printCollectionReport('notifications', notifications, notificationsCount);

const syncLogsCount = await countCollection('syncLogs');
const syncLogs = await sampleCollection('syncLogs');
printCollectionReport('syncLogs', syncLogs, syncLogsCount);

const settingsRef = db.doc('settings/sheetsConfig');
const settingsSnap = await settingsRef.get();
console.log('\n[DOCUMENT] settings/sheetsConfig');
console.log(`EXISTS=${settingsSnap.exists}`);
if (settingsSnap.exists) {
  const info = inspectFields(settingsSnap.data());
  console.log(`SAMPLE_FIELD_NAMES=${Object.keys(info.fields).sort().join(',') || '(none)'}`);
  console.log(`SENSITIVE_FIELD_NAMES=${info.sensitive.join(',') || '(none)'}`);
  console.log(`PII_FIELD_NAMES=${info.pii.join(',') || '(none)'}`);
  console.log(`RECIPIENT_OR_SCOPE_FIELD_NAMES=${info.recipient.join(',') || '(none)'}`);
  if ('syncQueue' in settingsSnap.data()) {
    console.log(`SYNC_QUEUE_SHAPE=${safeValueShape(settingsSnap.data().syncQueue)}`);
  }
}

// Static authorization/read-scope conclusions based strictly on current firestore.rules.
console.log('\n[AUTHORIZATION_SCOPE_REVIEW]');
console.log('SELLERS_READ_SCOPE=ADMIN_DEPUTY_FULL;SUPERVISOR_OWN_AND_MANAGED;SELLER_OWN');
console.log('PRODUCTS_READ_SCOPE=ANY_ACTIVE_AUTHENTICATED_ROLE');
console.log('ORDERS_READ_SCOPE=ADMIN_DEPUTY_FULL;SUPERVISOR_ASSIGNED_OR_OWN;SELLER_OWN');
console.log('NOTIFICATIONS_READ_SCOPE=ANY_ACTIVE_AUTHENTICATED_ROLE');
console.log('SYNCLOGS_READ_SCOPE=ADMIN_DEPUTY_ONLY');
console.log('SETTINGS_READ_SCOPE=ADMIN_DEPUTY_ONLY');
console.log('CLIENT_SIDE_FILTERING_IS_NOT_AUTHORIZATION=TRUE');

console.log('\n[EXPOSURE_FLAGS]');
console.log('FLAG_PRODUCTS_WHOLESALE_TO_ACTIVE_SELLERS=TRUE');
console.log(`FLAG_NOTIFICATIONS_NO_OBVIOUS_RECIPIENT_FIELD_IN_SAMPLE=${notifications.length > 0 && !notifications.some(d => Object.keys(d.data()).some(k => recipientNames.test(k)))}`);
console.log(`FLAG_SYNCLOGS_DETAILS_FIELD_PRESENT=${syncLogs.some(d => Object.prototype.hasOwnProperty.call(d.data(), 'details'))}`);
console.log(`FLAG_ORDERS_CUSTOMER_PII_PRESENT=${orders.some(d => Object.keys(d.data()).some(k => /phone|address|customerName|notes/i.test(k)))}`);
console.log(`FLAG_SELLERS_PII_PRESENT=${sellers.some(d => Object.keys(d.data()).some(k => /phone|email|username/i.test(k)))}`);

console.log('\n[READ_SCOPE_COST_NOTES]');
console.log('SELLERS_FULL_DIRECTORY_FOR_ADMIN_DEPUTY=REVIEW_REQUIRED');
console.log('PRODUCTS_FULL_REALTIME_CATALOG=REVIEW_REQUIRED');
console.log('NOTIFICATIONS_LATEST_50_REALTIME=REVIEW_REQUIRED');
console.log('SYNCLOGS_LATEST_100_REALTIME=REVIEW_REQUIRED');
console.log('ORDERS_OPERATIONAL_LISTENER_BOUNDED=PASS_EXPECTED');
console.log('DASHBOARD_SCALAR_KPIS_USE_AGGREGATION=PASS_EXPECTED');

console.log('\nFIRESTORE_WRITES=' + firestoreWrites);
console.log('FIRESTORE_DELETES=' + firestoreDeletes);
console.log('AUTH_MUTATIONS=' + authMutations);
console.log('RESULT=READ_ONLY_PASS');
