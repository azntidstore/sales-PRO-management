import fs from 'node:fs';
import crypto from 'node:crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const projectId = process.env.FIREBASE_PROJECT_ID;
if (!credPath) throw new Error('GOOGLE_APPLICATION_CREDENTIALS is required');
if (!projectId) throw new Error('FIREBASE_PROJECT_ID is required');
const credentialJson = JSON.parse(fs.readFileSync(credPath, 'utf8'));
if (!getApps().length) initializeApp({ credential: cert(credentialJson), projectId });
const db = getFirestore();
const auth = getAuth();

const sellersSnap = await db.collection('sellers').get();
const authUsers = [];
let authNext;
do {
  const page = await auth.listUsers(1000, authNext);
  authUsers.push(...page.users);
  authNext = page.pageToken;
} while (authNext);

const stats = { total: sellersSnap.size, withPassword: 0, missingPassword: 0, emptyPassword: 0, uniquePasswordValues: 0, duplicatePasswordValueGroups: 0, identityMatchCounts: { username: 0, email: 0, phone: 0, id: 0, name: 0 }, patternCounts: { bcrypt: 0, argon2: 0, pbkdf2OrScryptLike: 0, longHexOrBase64Like: 0, shortPlaintextLike: 0, other: 0 }, lengthHistogram: {} };
const fingerprints = new Map();
const authByUid = new Map(authUsers.map(u => [u.uid, u]));
const authByEmail = new Map(authUsers.filter(u => u.email).map(u => [u.email.toLowerCase(), u]));

function normalize(v) { return String(v ?? '').trim().toLowerCase(); }
function classify(v) {
  if (/^\$2[aby]\$\d{2}\$/.test(v)) return 'bcrypt';
  if (/^\$argon2(id|i|d)\$/.test(v)) return 'argon2';
  if (/^(pbkdf2|scrypt)[:$]/i.test(v)) return 'pbkdf2OrScryptLike';
  if (/^[A-Fa-f0-9]{32,}$/.test(v) || /^[A-Za-z0-9+/=_-]{40,}$/.test(v)) return 'longHexOrBase64Like';
  if (v.length > 0 && v.length <= 32) return 'shortPlaintextLike';
  return 'other';
}

for (const doc of sellersSnap.docs) {
  const d = doc.data();
  if (!Object.prototype.hasOwnProperty.call(d, 'password')) { stats.missingPassword++; continue; }
  stats.withPassword++;
  const p = typeof d.password === 'string' ? d.password : String(d.password ?? '');
  if (!p) { stats.emptyPassword++; continue; }
  stats.lengthHistogram[p.length] = (stats.lengthHistogram[p.length] ?? 0) + 1;
  const fp = crypto.createHash('sha256').update(p, 'utf8').digest('hex');
  fingerprints.set(fp, (fingerprints.get(fp) ?? 0) + 1);
  stats.patternCounts[classify(p)]++;
  const candidates = [['username', d.username], ['email', d.email], ['phone', d.phone], ['id', d.id ?? doc.id], ['name', d.name]];
  for (const [kind, value] of candidates) if (normalize(value) && normalize(value) === normalize(p)) stats.identityMatchCounts[kind]++;
}

stats.uniquePasswordValues = fingerprints.size;
stats.duplicatePasswordValueGroups = [...fingerprints.values()].filter(n => n > 1).length;

const uidLinked = sellersSnap.docs.filter(doc => {
  const uid = doc.data().uid;
  return typeof uid === 'string' && uid && authByUid.has(uid);
}).length;
const emailLinked = sellersSnap.docs.filter(doc => {
  const email = normalize(doc.data().email);
  return email && authByEmail.has(email);
}).length;

console.log('S6-C3-B-R1 PASSWORD FORENSICS');
console.log('MODE=READ_ONLY');
console.log(`PROJECT_ID=${projectId}`);
console.log(`SELLERS_COUNT=${stats.total}`);
console.log(`SELLERS_WITH_PASSWORD_FIELD=${stats.withPassword}`);
console.log(`SELLERS_WITHOUT_PASSWORD_FIELD=${stats.missingPassword}`);
console.log(`NONEMPTY_PASSWORD_FIELDS=${stats.withPassword - stats.emptyPassword}`);
console.log(`EMPTY_PASSWORD_FIELDS=${stats.emptyPassword}`);
console.log(`UNIQUE_NONEMPTY_PASSWORD_VALUES=${stats.uniquePasswordValues}`);
console.log(`DUPLICATE_PASSWORD_VALUE_GROUPS=${stats.duplicatePasswordValueGroups}`);
console.log(`PASSWORD_LENGTH_HISTOGRAM=${JSON.stringify(stats.lengthHistogram)}`);
console.log(`PASSWORD_PATTERN_COUNTS=${JSON.stringify(stats.patternCounts)}`);
console.log(`PASSWORD_EQUALS_USERNAME_COUNT=${stats.identityMatchCounts.username}`);
console.log(`PASSWORD_EQUALS_EMAIL_COUNT=${stats.identityMatchCounts.email}`);
console.log(`PASSWORD_EQUALS_PHONE_COUNT=${stats.identityMatchCounts.phone}`);
console.log(`PASSWORD_EQUALS_SELLER_ID_COUNT=${stats.identityMatchCounts.id}`);
console.log(`PASSWORD_EQUALS_NAME_COUNT=${stats.identityMatchCounts.name}`);
console.log(`SELLERS_UID_LINKED_TO_AUTH=${uidLinked}`);
console.log(`SELLERS_EMAIL_MATCH_AUTH=${emailLinked}`);
console.log(`AUTH_USER_COUNT=${authUsers.length}`);
console.log('PASSWORD_VALUES_PRINTED=0');
console.log('PASSWORD_FINGERPRINTS_PRINTED=0');
console.log('AUTH_PASSWORDS_ACCESSED=0');
console.log('FIRESTORE_WRITES=0');
console.log('FIRESTORE_DELETES=0');
console.log('AUTH_MUTATIONS=0');
console.log('RESULT=READ_ONLY_PASS');
