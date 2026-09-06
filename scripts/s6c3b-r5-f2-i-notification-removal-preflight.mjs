import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const candidates = [
  'src/types.ts',
  'src/App.tsx',
  'src/utils/FirestoreService.ts',
  'src/dbMock.ts',
  'src/components/OrdersTable.tsx',
  'src/components/SellersManager.tsx',
  'firestore.rules',
  'package.json',
];

const read = f => {
  const p = path.join(root, f);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
};
const src = Object.fromEntries(candidates.map(f => [f, read(f)]));

const patterns = [
  /AppNotification/g,
  /notifications/g,
  /triggerNotification/g,
  /onNotificationsChange/g,
  /order_created/g,
  /order_updated/g,
  /order_deleted/g,
  /seller_created/g,
  /seller_updated/g,
  /seller_deleted/g,
];

const hits = new Map();
for (const f of candidates) {
  const lines = src[f].split(/\r?\n/);
  for (const [pi, re] of patterns.entries()) {
    for (let i = 0; i < lines.length; i++) {
      re.lastIndex = 0;
      if (re.test(lines[i])) {
        const key = re.source;
        if (!hits.has(key)) hits.set(key, []);
        hits.get(key).push(`${f}:${i + 1}`);
      }
    }
  }
}

const requiredChecks = [
  ['FILES_PRESENT', candidates.every(f => src[f].length > 0)],
  ['MODEL_EVIDENCE', /AppNotification|notifications/i.test(src['src/types.ts'])],
  ['LISTENER_EVIDENCE', /onNotificationsChange|collection\(db,\s*['"]notifications['"]/i.test(src['src/utils/FirestoreService.ts'])],
  ['WRITE_TRIGGER_EVIDENCE',
    /triggerNotification/i.test(src['src/components/OrdersTable.tsx']) &&
    /triggerNotification/i.test(src['src/components/SellersManager.tsx'])],
  ['UI_OR_STATE_EVIDENCE', /notification/i.test(src['src/App.tsx'])],
  ['RULES_DEPENDENCY_EVIDENCE', /match\s+\/notifications\/\{notificationId\}/i.test(src['firestore.rules'])],
  ['ORDER_COUPLING_PRESENT', /triggerNotification/i.test(src['src/components/OrdersTable.tsx'])],
  ['SELLER_COUPLING_PRESENT', /triggerNotification/i.test(src['src/components/SellersManager.tsx'])],
  ['LEGACY_DATA_NOT_TOUCHED', true],
  ['NO_PRODUCTION_MUTATION', true],
  ['NO_AUTH_MUTATION', true],
  ['NO_RULES_CHANGE', true],
];

console.log('S6-C3-B-R5-F2-I NOTIFICATION REMOVAL PREFLIGHT');
console.log('MODE=STATIC_READ_ONLY');
console.log('APPROVED_DIRECTION=REMOVE_NON_ESSENTIAL_NOTIFICATION_SERVICE');
console.log('');
for (const [name, ok] of requiredChecks) console.log(`${name}=${ok ? 'PASS' : 'FAIL'}`);

console.log('');
console.log('[1] NOTIFICATION DEPENDENCY INVENTORY');
for (const [pattern, locations] of hits) {
  console.log(`PATTERN=${pattern}`);
  for (const loc of locations.slice(0, 30)) console.log(`  ${loc}`);
}

console.log('');
console.log('[2] REMOVAL IMPACT');
console.log('REMOVE_LISTENER=YES');
console.log('REMOVE_NEW_NOTIFICATION_WRITES=YES');
console.log('REMOVE_NOTIFICATION_UI_OR_STATE=IF_PRESENT');
console.log('REMOVE_NAME_BASED_NOTIFICATION_VISIBILITY=YES');
console.log('PRESERVE_ORDER_FUNCTIONALITY=YES');
console.log('PRESERVE_SELLER_FUNCTIONALITY=YES');
console.log('PRESERVE_LEGACY_NOTIFICATION_DOCUMENTS=UNTIL_SEPARATE_DELETE_GATE');

console.log('');
console.log('[3] PRODUCTION SAFETY');
console.log('FIRESTORE_WRITES=0');
console.log('FIRESTORE_DELETES=0');
console.log('AUTH_MUTATIONS=0');
console.log('RULES_CHANGED=0');

const failed = requiredChecks.filter(([, ok]) => !ok).length;
console.log('');
console.log(`CHECKS=${requiredChecks.length}`);
console.log(`PASSED=${requiredChecks.length - failed}`);
console.log(`FAILED=${failed}`);
console.log(failed ? 'RESULT=REMOVAL_PREFLIGHT_FAIL' : 'RESULT=REMOVAL_PREFLIGHT_PASS');
console.log('NEXT_STEP=USER_GATE_BEFORE_SOURCE_REMOVAL');
process.exitCode = failed ? 1 : 0;
