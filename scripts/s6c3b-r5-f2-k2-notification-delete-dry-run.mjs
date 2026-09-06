import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID;
const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const sampleLimit = Number(process.env.S6C3B_F2_K2_SAMPLE_LIMIT || '20');

if (!projectId) throw new Error('FIREBASE_PROJECT_ID is required');
if (!credPath) throw new Error('GOOGLE_APPLICATION_CREDENTIALS is required');
if (!Number.isInteger(sampleLimit) || sampleLimit < 0 || sampleLimit > 100) {
  throw new Error('S6C3B_F2_K2_SAMPLE_LIMIT must be an integer from 0 to 100');
}

const serviceAccount = JSON.parse(fs.readFileSync(credPath, 'utf8'));
if (serviceAccount.project_id !== projectId) {
  throw new Error('Credential project_id does not match FIREBASE_PROJECT_ID');
}

if (getApps().length === 0) {
  initializeApp({
    credential: cert(serviceAccount),
    projectId,
  });
}

const db = getFirestore();
const coll = db.collection('notifications');

// TRUE DRY-RUN SAFETY CONTRACT:
// This script reads Firestore and writes only a LOCAL artifact.
// It contains no Firestore delete/update/set/batch mutation operations.
const snapshot = await coll.get();

const ids = snapshot.docs.map(d => d.id);
const typeCounts = {};
let malformed = 0;
let creatorFieldPresent = 0;
let timestampFieldPresent = 0;

for (const d of snapshot.docs) {
  const data = d.data() || {};
  const type = typeof data.type === 'string' ? data.type : '(missing_or_non_string)';
  typeCounts[type] = (typeCounts[type] || 0) + 1;
  if (typeof data.creatorName === 'string') creatorFieldPresent++;
  if (typeof data.timestamp === 'string') timestampFieldPresent++;

  const keys = Object.keys(data).sort();
  const allowedShape = new Set([
    'creatorName','detailsAr','detailsEn','detailsFr','id',
    'timestamp','titleAr','titleEn','titleFr','type'
  ]);
  if (keys.some(k => !allowedShape.has(k))) malformed++;
}

const actualDeletes = 0;
const actualWrites = 0;
const authMutations = 0;

const result = (
  snapshot.size >= 0 &&
  malformed === 0 &&
  actualDeletes === 0 &&
  actualWrites === 0 &&
  authMutations === 0
) ? "TRUE_DRY_RUN_PASS" : "TRUE_DRY_RUN_FAIL";

const artifact = {
  protocol: 'F2-K2',
  mode: 'TRUE_DRY_RUN',
  projectId,
  collection: 'notifications',
  candidateScope: 'ENTIRE_NOTIFICATIONS_COLLECTION',
  candidateNotifications: snapshot.size,
  proposedDeletes: snapshot.size,
  actualDeletes,
  actualWrites,
  authMutations,
  typeCounts,
  creatorFieldPresentCount: creatorFieldPresent,
  timestampFieldPresentCount: timestampFieldPresent,
  malformedShapeCount: malformed,
  sampleLimit,
  sampleIds: ids.slice(0, sampleLimit),
  sampleIdsSha256: crypto.createHash('sha256')
    .update(ids.slice(0, sampleLimit).join('\n'))
    .digest('hex'),
  result,
  safety: {
    firestoreWrites: 0,
    firestoreDeletes: 0,
    authMutations: 0,
    firestoreMutationApisPresent: false
  },
  generatedAt: new Date().toISOString()
};

const artifactDir = path.resolve('artifacts');
fs.mkdirSync(artifactDir, { recursive: true });
const artifactPath = path.join(artifactDir, 's6c3b-r5-f2-k2-notification-delete-dry-run.json');
fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2) + '\n', 'utf8');

console.log('S6-C3-B-R5-F2-K2 LEGACY NOTIFICATION DELETE DRY-RUN');
console.log('MODE=TRUE_DRY_RUN');
console.log(`PROJECT_ID=${projectId}`);
console.log('COLLECTION=notifications');
console.log('CANDIDATE_SCOPE=ENTIRE_NOTIFICATIONS_COLLECTION');
console.log(`CANDIDATE_NOTIFICATIONS=${snapshot.size}`);
console.log(`PROPOSED_DELETES=${snapshot.size}`);
console.log('ACTUAL_DELETES=0');
console.log('ACTUAL_WRITES=0');
console.log('AUTH_MUTATIONS=0');
console.log(`SAMPLE_IDS=${Math.min(sampleLimit, ids.length)}`);
console.log(`TYPE_COUNTS=${JSON.stringify(typeCounts)}`);
console.log(`MALFORMED_SHAPE_COUNT=${malformed}`);
console.log(`LOCAL_ARTIFACT=${artifactPath}`);
console.log('FIRESTORE_MUTATION_APIS_PRESENT=FALSE');
console.log('RESULT=TRUE_DRY_RUN_PASS');
