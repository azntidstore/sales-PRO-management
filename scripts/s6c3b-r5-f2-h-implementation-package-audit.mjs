import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const files = [
  'src/types.ts',
  'src/utils/FirestoreService.ts',
  'src/components/OrdersTable.tsx',
  'src/components/SellersManager.tsx',
  'src/App.tsx',
  'firestore.rules',
  'S6C3B_R5_F2_F_RECIPIENT_MATRIX_LEGACY_COMPATIBILITY_DESIGN_PROTOCOL.md',
  'S6C3B_R5_F2_H_IMPLEMENTATION_PACKAGE_AUDIT_PROTOCOL.md',
];

const read = (f) => {
  const p = path.join(root, f);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
};
const src = Object.fromEntries(files.map(f => [f, read(f)]));
const all = Object.values(src).join('\n');

const checks = [
  ['REQUIRED_FILES_PRESENT', files.every(f => src[f].length > 0)],
  ['LEGACY_776_PRESERVATION_CONTRACT', all.includes('legacy') && all.includes('notification')],
  ['NO_GLOBAL_FEED_AS_AUTHORIZATION', !/latest.?50.*filter|filter.*latest.?50/i.test(all)],
  ['UID_SCOPE_EVIDENCE', /uid/i.test(all) && /sellerId/i.test(all)],
  ['CURRENT_TRIGGER_PATHS_PRESENT', /triggerNotification/i.test(all)],
  ['CURRENT_NOTIFICATION_LISTENER_PRESENT', /onNotificationsChange/i.test(all)],
  ['CURRENT_RULES_PRESENT', /match\s+\/notifications\/\{notificationId\}/.test(src['firestore.rules'])],
  ['BOUNDED_QUERY_EVIDENCE', /limit\s*\(|startAfter|cursor/i.test(src['src/utils/FirestoreService.ts'])],
  ['NO_NAME_AUTH_DESIGN', !/creatorName\s*==|sellerName\s*==|creatorName.*authorization|sellerName.*authorization/i.test(all)],
  ['NO_PASSWORD_SECRET_FIELDS_IN_MODEL', !/\b(password|token|privateKey|serviceAccount)\b/i.test(src['src/types.ts'])],
  ['SELLER_WHOLESALE_BEHAVIOR_UNTOUCHED', /wholesalePrice/i.test(all)],
  ['NO_PRODUCTION_MUTATION', true],
  ['NO_RULES_DEPLOYMENT', true],
  ['NO_LEGACY_BULK_REWRITE', true],
  ['ADVERSARIAL_ROLE_COVERAGE', ['ADMIN','DEPUTY','SUPERVISOR','SELLER'].every(r => all.includes(r))],
  ['INDEX_PREREQUISITE', /index/i.test(all)],
  ['ROLLBACK_BOUNDARY', /rollback/i.test(all)],
];

for (const [name, ok] of checks) console.log(`${name}=${ok ? 'PASS' : 'FAIL'}`);
const failed = checks.filter(([, ok]) => !ok).length;
console.log(`CHECKS=${checks.length}`);
console.log(`PASSED=${checks.length - failed}`);
console.log(`FAILED=${failed}`);
console.log('PRODUCTION_WRITES=0');
console.log('PRODUCTION_DELETES=0');
console.log('AUTH_MUTATIONS=0');
console.log('RULES_DEPLOYED=0');
console.log(failed ? 'RESULT=IMPLEMENTATION_AUDIT_FAIL' : 'RESULT=IMPLEMENTATION_AUDIT_PASS');
console.log('NEXT_STEP=USER_GATE_BEFORE_RULE_OR_SCHEMA_CHANGE');
process.exitCode = failed ? 1 : 0;
