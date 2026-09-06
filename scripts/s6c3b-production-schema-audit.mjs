import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || undefined;
const SAMPLE_LIMIT = 3;
const collections = ['settings/sheetsConfig','syncLogs','notifications','products','sellers','orders'];
const sensitivePatterns = [
  /password/i, /passwd/i, /secret/i, /token/i, /credential/i, /private.?key/i,
  /api.?key/i, /access.?key/i, /refresh.?token/i, /id.?token/i,
  /customer.?phone/i, /^phone$/i, /customer.?address/i, /^address$/i,
  /customer.?name/i, /notes?/i
];

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('ERROR: GOOGLE_APPLICATION_CREDENTIALS is required.');
  process.exit(2);
}

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
} catch (err) {
  console.error(`ERROR: Cannot read GOOGLE_APPLICATION_CREDENTIALS file: ${err?.message || String(err)}`);
  process.exit(2);
}

initializeApp({
  credential: cert(serviceAccount),
  ...(PROJECT_ID ? { projectId: PROJECT_ID } : {})
});
const db = getFirestore();

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const typeOf = v => v === null ? 'null' : Array.isArray(v) ? 'array' : v instanceof Timestamp ? 'timestamp' : typeof v;
const safeFieldName = k => sensitivePatterns.some(r => r.test(k));

function fieldMap(docs) {
  const map = new Map();
  for (const doc of docs) {
    for (const [k,v] of Object.entries(doc.data())) {
      if (!map.has(k)) map.set(k, new Set());
      map.get(k).add(typeOf(v));
    }
  }
  return [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([name,types]) => ({
    name, types:[...types].sort(), sensitiveName:safeFieldName(name)
  }));
}

const results = [];
let writes = 0, deletes = 0;

async function inspectPath(path) {
  if (path.includes('/')) {
    const snap = await db.doc(path).get();
    const fields = snap.exists ? fieldMap([snap]) : [];
    results.push({path, kind:'document', exists:snap.exists, sampleDocs:snap.exists?1:0, fields});
    return;
  }
  const ref = db.collection(path);
  const countSnap = await ref.count().get();
  const sampleSnap = await ref.limit(SAMPLE_LIMIT).get();
  const fields = fieldMap(sampleSnap.docs);
  results.push({path, kind:'collection', count:countSnap.data().count, sampleDocs:sampleSnap.size, fields});
}

try {
  for (const path of collections) await inspectPath(path);
  const suspicious = results.flatMap(r => r.fields.filter(f=>f.sensitiveName).map(f=>({path:r.path, field:f.name, types:f.types})));

  console.log('S6-C3-B PRODUCTION SCHEMA AUDIT');
  console.log('MODE=READ_ONLY');
  console.log(`PROJECT_ID=${PROJECT_ID || '(credential default)'}`);
  console.log(`SAMPLE_LIMIT=${SAMPLE_LIMIT}`);
  console.log('');
  for (const r of results) {
    console.log(`[${r.kind.toUpperCase()}] ${r.path}`);
    if (r.kind === 'collection') console.log(`COUNT=${r.count}`);
    console.log(`SAMPLE_DOCS=${r.sampleDocs}`);
    console.log(`FIELDS=${r.fields.map(f=>`${f.name}{${f.types.join('|')}}`).join(', ') || '(none)'}`);
    const flagged = r.fields.filter(f=>f.sensitiveName).map(f=>f.name);
    console.log(`FLAGGED_FIELD_NAMES=${flagged.join(', ') || '(none)'}`);
  }
  console.log('');
  console.log(`SENSITIVE_FIELD_NAME_MATCHES=${suspicious.length}`);
  for (const x of suspicious) console.log(`FLAG ${x.path}.${x.field} TYPES=${x.types.join('|')}`);
  console.log('');
  console.log(`FIRESTORE_WRITES=${writes}`);
  console.log(`FIRESTORE_DELETES=${deletes}`);
  console.log('AUTH_MUTATIONS=0');
  console.log('RESULT=READ_ONLY_PASS');
} catch (err) {
  console.error(`AUDIT_ERROR=${err?.message || String(err)}`);
  process.exitCode = 1;
}
