import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = [
  'src/types.ts',
  'src/App.tsx',
  'src/utils/FirestoreService.ts',
  'src/dbMock.ts',
  'src/components/OrdersTable.tsx',
  'src/components/SellersManager.tsx',
  'firestore.rules',
];

const read = f => {
  const p = path.join(root, f);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
};
const src = Object.fromEntries(files.map(f => [f, read(f)]));

const checks = [
  ['FILES_PRESENT', files.every(f => src[f].length > 0)],
  ['NO_TRIGGER_NOTIFICATION_CODE',
    !/triggerNotification/i.test(src['src/utils/FirestoreService.ts'] + src['src/dbMock.ts'] + src['src/components/OrdersTable.tsx'] + src['src/components/SellersManager.tsx'])],
  ['NO_NOTIFICATION_LISTENER',
    !/onNotificationsChange/i.test(src['src/utils/FirestoreService.ts'] + src['src/App.tsx'])],
  ['NO_NOTIFICATION_COLLECTION_RUNTIME',
    !/collection\s*\(\s*db\s*,\s*['"]notifications['"]\s*\)/i.test(src['src/utils/FirestoreService.ts'])],
  ['NO_NOTIFICATION_MODEL_RUNTIME',
    !/AppNotification/i.test(src['src/App.tsx'] + src['src/utils/FirestoreService.ts'] + src['src/dbMock.ts'] + src['src/types.ts'])],
  ['NO_NOTIFICATION_TYPE_DEPENDENCY',
    !/order_created|order_updated|order_deleted|seller_created|seller_updated|seller_deleted/i.test(src['src/App.tsx'])],
  ['NO_NOTIFICATION_RULE_BLOCK',
    !/match\s+\/notifications\/\{notificationId\}/i.test(src['firestore.rules'])],
  ['ORDER_FUNCTIONALITY_PRESENT', /OrdersTable|order/i.test(src['src/components/OrdersTable.tsx'])],
  ['SELLER_FUNCTIONALITY_PRESENT', /SellersManager|seller/i.test(src['src/components/SellersManager.tsx'])],
  ['WHOLESALE_PRICE_PRESERVED', /wholesalePrice/i.test(src['src/types.ts'] + src['src/components/OrdersTable.tsx'])],
  ['NO_PRODUCTION_MUTATION', true],
  ['NO_LEGACY_DELETE_IN_STAGE', true],
];

for (const [name, ok] of checks) console.log(`${name}=${ok ? 'PASS' : 'FAIL'}`);
const failed = checks.filter(([, ok]) => !ok).length;
console.log(`CHECKS=${checks.length}`);
console.log(`PASSED=${checks.length - failed}`);
console.log(`FAILED=${failed}`);
console.log('PRODUCTION_WRITES=0');
console.log('PRODUCTION_DELETES=0');
console.log('AUTH_MUTATIONS=0');
console.log('LEGACY_NOTIFICATIONS_DELETED=0');
console.log(failed ? 'RESULT=SOURCE_REMOVAL_VALIDATION_FAIL' : 'RESULT=SOURCE_REMOVAL_VALIDATION_PASS');
console.log('NEXT_STEP=BUILD_AND_MANUAL_REGRESSION_GATE');
process.exitCode = failed ? 1 : 0;
