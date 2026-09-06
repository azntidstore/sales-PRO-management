import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = [
  'src/types.ts',
  'src/utils/FirestoreService.ts',
  'src/components/OrdersTable.tsx',
  'src/components/SellersManager.tsx',
  'src/App.tsx',
  'src/dbMock.ts',
  'firestore.rules',
];

const read = f => {
  const p = path.join(root, f);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
};
const src = Object.fromEntries(files.map(f => [f, read(f)]));

const findLines = (text, pattern) =>
  text.split(/\r?\n/).map((line, i) => ({ line, n: i + 1 }))
    .filter(x => pattern.test(x.line)).slice(0, 12);

const checks = [
  ['FILES_PRESENT', files.every(f => src[f].length > 0)],
  ['VISIBILITY_FUNCTION_PRESENT',
    /notification.*visib|visible.*notification|filter.*notification/i.test(src['src/App.tsx'])],
  ['CREATOR_NAME_VISIBILITY_EVIDENCE',
    /creatorName/i.test(src['src/App.tsx']) || /creatorName/i.test(src['src/components/OrdersTable.tsx'])],
  ['HIERARCHY_VISIBILITY_EVIDENCE',
    /parentId|parentIds|assignedSupervisorId/i.test(src['src/App.tsx'])],
  ['GLOBAL_LISTENER_EVIDENCE',
    /onNotificationsChange|orderBy\s*\(\s*['"]timestamp['"]|limit\s*\(\s*50\s*\)/i.test(src['src/utils/FirestoreService.ts'])],
  ['TRIGGER_PATH_EVIDENCE',
    /triggerNotification/i.test(src['src/components/OrdersTable.tsx']) &&
    /triggerNotification/i.test(src['src/components/SellersManager.tsx'])],
  ['ORDER_SCOPE_SOURCE_EVIDENCE',
    /sellerId|assignedSupervisorId|createdByUid/i.test(src['src/components/OrdersTable.tsx'])],
  ['SELLER_SCOPE_SOURCE_EVIDENCE',
    /uid|sellerId|parentId|parentIds/i.test(src['src/components/SellersManager.tsx'])],
  ['UID_MODEL_EVIDENCE', /uid/i.test(src['src/types.ts'])],
  ['SELLER_ID_MODEL_EVIDENCE', /sellerId/i.test(src['src/types.ts'])],
  ['LEGACY_COMPATIBILITY_REQUIRED', true],
  ['INDEX_REVIEW_REQUIRED', true],
  ['NO_PRODUCTION_MUTATION', true],
];

console.log('S6-C3-B-R5-F2-H-R1 NOTIFICATION IMPLEMENTATION GAP ANALYSIS');
console.log('MODE=STATIC_READ_ONLY');
console.log('');
for (const [name, ok] of checks) console.log(`${name}=${ok ? 'PASS' : 'FAIL'}`);
console.log('');
console.log('[GAP 1] CURRENT VISIBILITY / AUTHORIZATION SIGNALS');
for (const f of ['src/App.tsx','src/components/OrdersTable.tsx','src/components/SellersManager.tsx']) {
  for (const x of findLines(src[f], /creatorName|sellerName|parentId|parentIds|assignedSupervisorId|role/i))
    console.log(`${f}:${x.n} ${x.line.trim()}`);
}
console.log('');
console.log('[GAP 2] CURRENT NOTIFICATION LISTENER');
for (const x of findLines(src['src/utils/FirestoreService.ts'], /onNotificationsChange|timestamp|limit\s*\(\s*50\s*\)/i))
  console.log(`src/utils/FirestoreService.ts:${x.n} ${x.line.trim()}`);
console.log('');
console.log('[GAP 3] NOTIFICATION WRITE CALL SITES');
for (const f of ['src/components/OrdersTable.tsx','src/components/SellersManager.tsx']) {
  for (const x of findLines(src[f], /triggerNotification/i))
    console.log(`${f}:${x.n} ${x.line.trim()}`);
}
console.log('');
console.log('[GAP 4] STABLE SCOPE EVIDENCE');
for (const f of ['src/types.ts','src/components/OrdersTable.tsx','src/components/SellersManager.tsx','src/utils/FirestoreService.ts']) {
  for (const x of findLines(src[f], /sellerId|createdByUid|assignedSupervisorId|uid/i))
    console.log(`${f}:${x.n} ${x.line.trim()}`);
}
console.log('');
console.log('[GAP 5] CURRENT RULES NOTIFICATION BLOCK');
const ruleLines = src['firestore.rules'].split(/\r?\n/);
let inBlock = false;
for (let i = 0; i < ruleLines.length; i++) {
  if (/match\s+\/notifications\/\{notificationId\}/.test(ruleLines[i])) inBlock = true;
  if (inBlock) {
    console.log(`firestore.rules:${i + 1} ${ruleLines[i]}`);
    if (inBlock && i > 0 && /match\s+\/syncLogs\/\{logId\}/.test(ruleLines[i])) break;
  }
}
console.log('');
console.log('[GAP 6] IMPLEMENTATION IMPACT');
console.log('LEGACY_DOCUMENTS=KEEP_AS_IS');
console.log('FUTURE_WRITES=ADD_EXPLICIT_RECIPIENT_OR_SCOPE');
console.log('AUTHORIZATION=RULES_AND_QUERY_SCOPE_NOT_CLIENT_NAME_FILTER');
console.log('INDEXES=DEFINE_BEFORE_QUERY_OR_RULE_ROLLOUT');
console.log('MIGRATION=NONE_IN_H_R1');
console.log('');
console.log(`CHECKS=${checks.length}`);
const failed = checks.filter(([, ok]) => !ok).length;
console.log(`PASSED=${checks.length - failed}`);
console.log(`FAILED=${failed}`);
console.log('PRODUCTION_WRITES=0');
console.log('PRODUCTION_DELETES=0');
console.log('AUTH_MUTATIONS=0');
console.log(failed ? 'RESULT=GAP_ANALYSIS_FAIL' : 'RESULT=GAP_ANALYSIS_PASS');
console.log('NEXT_STEP=USER_GATE_BEFORE_IMPLEMENTATION');
process.exitCode = failed ? 1 : 0;
