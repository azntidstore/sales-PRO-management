import fs from 'node:fs';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;

if (!credentialPath) {
  console.error('ERROR: Set GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON path before running this read-only audit.');
  process.exit(2);
}
if (!fs.existsSync(credentialPath)) {
  console.error(`ERROR: Credential file does not exist: ${credentialPath}`);
  process.exit(2);
}

const credential = JSON.parse(fs.readFileSync(credentialPath, 'utf8'));
if (!projectId && !credential.project_id) {
  console.error('ERROR: Set FIREBASE_PROJECT_ID or provide project_id in the credential file.');
  process.exit(2);
}

if (!getApps().length) {
  initializeApp({ credential: cert(credential), ...(projectId ? { projectId } : {}) });
}

const auth = getAuth();
const db = getFirestore();

const usersSnap = await db.collection('users').get();
const sellersSnap = await db.collection('sellers').get();

const authUsers = [];
let pageToken;
do {
  const page = await auth.listUsers(1000, pageToken);
  for (const u of page.users) {
    authUsers.push({ uid: u.uid, disabled: !!u.disabled, hasEmail: !!u.email });
  }
  pageToken = page.pageToken;
} while (pageToken);

const authByUid = new Map(authUsers.map(x => [x.uid, x]));
const userProfiles = new Map();
const userSellerIds = new Map();
const invalidUserDocs = [];
const userProfilesMissingAuth = [];
const userProfilesMissingSellerId = [];
const userProfilesMissingSeller = [];

for (const doc of usersSnap.docs) {
  const data = doc.data() || {};
  const uid = typeof data.uid === 'string' ? data.uid.trim() : '';
  const sellerId = typeof data.sellerId === 'string' ? data.sellerId.trim() : '';
  userProfiles.set(doc.id, { uid, sellerId, role: data.role || null, active: data.active });
  if (uid !== doc.id) invalidUserDocs.push({ docId: doc.id, uid: uid || null });
  if (!sellerId) userProfilesMissingSellerId.push(doc.id);
  if (!authByUid.has(doc.id)) userProfilesMissingAuth.push(doc.id);
  userSellerIds.set(doc.id, sellerId);
}

const sellerById = new Map();
const sellerUidToIds = new Map();
const sellersMissingAuth = [];
const sellersMissingUid = [];
for (const doc of sellersSnap.docs) {
  const data = doc.data() || {};
  const id = doc.id;
  const uid = typeof data.uid === 'string' ? data.uid.trim() : '';
  sellerById.set(id, { uid, name: typeof data.name === 'string' ? data.name : '' });
  if (!uid) sellersMissingUid.push(id);
  else {
    const ids = sellerUidToIds.get(uid) || [];
    ids.push(id);
    sellerUidToIds.set(uid, ids);
    if (!authByUid.has(uid)) sellersMissingAuth.push({ sellerId: id, uid });
  }
}

for (const [uid, profile] of userProfiles) {
  if (profile.sellerId && !sellerById.has(profile.sellerId)) {
    userProfilesMissingSeller.push({ uid, sellerId: profile.sellerId });
  }
}

const duplicateSellerUids = [...sellerUidToIds.entries()]
  .filter(([, ids]) => ids.length > 1)
  .map(([uid, ids]) => ({ uid, sellerIds: ids }));

const duplicateUserSellerIds = new Map();
for (const [uid, sellerId] of userSellerIds) {
  if (!sellerId) continue;
  const list = duplicateUserSellerIds.get(sellerId) || [];
  list.push(uid);
  duplicateUserSellerIds.set(sellerId, list);
}
const duplicateUserSellerAssignments = [...duplicateUserSellerIds.entries()]
  .filter(([, uids]) => uids.length > 1)
  .map(([sellerId, uids]) => ({ sellerId, uids }));

const authWithoutProfile = authUsers.filter(u => !userProfiles.has(u.uid)).map(u => ({ uid: u.uid, disabled: u.disabled, hasEmail: u.hasEmail }));
const canonicalLinkMismatches = [];
for (const u of authUsers) {
  const p = userProfiles.get(u.uid);
  if (!p || !p.sellerId) continue;
  const s = sellerById.get(p.sellerId);
  if (!s) continue;
  if (s.uid && s.uid !== u.uid) canonicalLinkMismatches.push({ uid: u.uid, sellerId: p.sellerId, sellerUid: s.uid });
}

const result = {
  mode: 'READ_ONLY',
  projectId: projectId || credential.project_id || null,
  authUsers: authUsers.length,
  userProfiles: usersSnap.size,
  sellers: sellersSnap.size,
  authWithoutProfile,
  userProfilesMissingAuth,
  invalidUserDocs,
  userProfilesMissingSellerId,
  userProfilesMissingSeller,
  sellersMissingAuth,
  sellersMissingUid,
  duplicateSellerUids,
  duplicateUserSellerAssignments,
  canonicalLinkMismatches,
};

console.log(JSON.stringify(result, null, 2));
console.log('READ_ONLY_ASSERTION=true');
console.log('FIRESTORE_WRITES=0');
console.log('FIRESTORE_DELETES=0');
console.log('AUTH_MUTATIONS=0');
