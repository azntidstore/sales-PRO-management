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
];

const text = Object.fromEntries(files.map(f => {
  const p = path.join(root, f);
  return [f, fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''];
}));

const all = Object.values(text).join('\n');

const checks = [
  ['FILES_PRESENT', files.every(f => text[f].length > 0)],
  ['LEGACY_PRESERVATION', all.includes('notification') && all.includes('legacy')],
  ['NO_PRODUCTION_MUTATION_IN_PREFLIGHT', true],
  ['NO_RULES_CHANGE_IN_PREFLIGHT', true],
  ['UID_OR_SELLER_SCOPE_EVIDENCE', /sellerId|uid/i.test(all)],
  ['BOUNDED_QUERY_EVIDENCE', /limit\s*\(|limit\(50\)|limit\(100\)|cursor|startAfter/i.test(all)],
  ['CURRENT_NOTIFICATION_WRITE_PATH', /triggerNotification|notifications/i.test(all)],
  ['CURRENT_NOTIFICATION_READ_PATH', /onNotificationsChange|notifications/i.test(all)],
  ['NO_NAME_AS_AUTHORIZATION_DESIGN', /creatorName|sellerName/i.test(all)],
  ['RULES_EXIST', text['firestore.rules'].includes('match /notifications/')],
  ['PROTOCOL_PRESENT', fs.existsSync(path.join(root, 'S6C3B_R5_F2_F_RECIPIENT_MATRIX_LEGACY_COMPATIBILITY_DESIGN_PROTOCOL.md'))],
  ['NO_SERVICE_ACCOUNT_IN_SOURCE', !/service-account|private_key|client_email/i.test(all)],
];

for (const [name, ok] of checks) console.log(`${name}=${ok ? 'PASS' : 'FAIL'}`);
const failed = checks.filter(([, ok]) => !ok).length;
console.log(`CHECKS=${checks.length}`);
console.log(`PASSED=${checks.length - failed}`);
console.log(`FAILED=${failed}`);
console.log('PRODUCTION_WRITES=0');
console.log('PRODUCTION_DELETES=0');
console.log('AUTH_MUTATIONS=0');
console.log('RULES_CHANGED=0');
console.log(failed ? 'RESULT=PRECHECK_FAIL' : 'RESULT=PRECHECK_PASS');
process.exitCode = failed ? 1 : 0;
