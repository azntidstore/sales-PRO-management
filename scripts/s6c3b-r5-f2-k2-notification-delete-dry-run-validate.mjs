import fs from 'node:fs';

const p = 'scripts/s6c3b-r5-f2-k2-notification-delete-dry-run.mjs';
const text = fs.readFileSync(p, 'utf8');

// Only reject Firestore/Auth mutation APIs.
// Generic `.update()` is intentionally NOT forbidden because the dry-run
// uses crypto.createHash(...).update(...) for a local SHA-256 fingerprint.
const forbidden = [
  /\bdeleteDoc\s*\(/i,
  /\bbatch\.delete\s*\(/i,
  /\bwriteBatch\s*\(/i,
  /\bsetDoc\s*\(/i,
  /\bupdateDoc\s*\(/i,
  /\brunTransaction\s*\(/i,
  /\bBulkWriter\b/i,
  /\brecursiveDelete\s*\(/i,
  /admin\.firestore\(\)[\s\S]{0,500}\.delete\s*\(/i,
  /admin\.firestore\(\)[\s\S]{0,500}\.set\s*\(/i,
  /admin\.firestore\(\)[\s\S]{0,500}\.update\s*\(/i
];

const checks = [
  ['SCRIPT_PRESENT', fs.existsSync(p)],
  ['USES_NOTIFICATIONS_COLLECTION', /collection\(['"]notifications['"]\)/.test(text)],
  ['NO_FIRESTORE_DELETE_APIS', !forbidden.some(r => r.test(text))],
  ['NO_AUTH_MUTATIONS', !/admin\.auth\(\)|deleteUser|updateUser|createUser/i.test(text)],
  ['LOCAL_ARTIFACT_ONLY', /fs\.writeFileSync/.test(text)],

  // Require explicit zero-valued safety constants.
  ['ACTUAL_DELETES_ZERO', /const\s+actualDeletes\s*=\s*0\s*;/.test(text)],
  ['ACTUAL_WRITES_ZERO', /const\s+actualWrites\s*=\s*0\s*;/.test(text)],
  ['AUTH_MUTATIONS_ZERO', /const\s+authMutations\s*=\s*0\s*;/.test(text)],

  ['TRUE_DRY_RUN_MODE', /TRUE_DRY_RUN/.test(text)]
];

for (const [name, ok] of checks) {
  console.log(`${name}=${ok ? 'PASS' : 'FAIL'}`);
}

const failed = checks.filter(([, ok]) => !ok).length;

console.log(`CHECKS=${checks.length}`);
console.log(`PASSED=${checks.length - failed}`);
console.log(`FAILED=${failed}`);
console.log(`RESULT=${failed ? 'VALIDATION_FAIL' : 'K2_DRY_RUN_SCRIPT_VALIDATION_PASS'}`);

if (failed) process.exit(1);