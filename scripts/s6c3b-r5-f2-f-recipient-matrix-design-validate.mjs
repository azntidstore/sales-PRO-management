import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const protocol = path.join(root, 'S6C3B_R5_F2_F_RECIPIENT_MATRIX_LEGACY_COMPATIBILITY_DESIGN_PROTOCOL.md');
const text = fs.readFileSync(protocol, 'utf8');

const checks = [
  ['DESIGN_ONLY', text.includes('DESIGN ONLY / READ-ONLY / NO PRODUCTION CHANGE')],
  ['NO_LEGACY_DELETE', text.includes('Preserve all existing legacy notifications unchanged')],
  ['ADMIN_ORDER', text.includes('order_created | ADMIN: ALL')],
  ['DEPUTY_ORDER', text.includes('order_created | ADMIN: ALL | DEPUTY: ALL management scope')],
  ['SUPERVISOR_ORDER',
    text.includes('SUPERVISOR: own + assigned/managed sellers')],
  ['SELLER_ORDER',
    text.includes('SELLER: own orders')],
  ['SELLER_EVENTS_ADMIN_DEPUTY',
    text.includes('seller_created | ADMIN: YES | DEPUTY: YES | SUPERVISOR: NO | SELLER: NO') &&
    text.includes('seller_updated | ADMIN: YES | DEPUTY: YES | SUPERVISOR: NO | SELLER: NO') &&
    text.includes('seller_deleted | ADMIN: YES | DEPUTY: YES | SUPERVISOR: NO | SELLER: NO')],
  ['UID_IDENTITY', text.includes('Use UID as the authorization identity')],
  ['SELLER_ID_BUSINESS_KEY', text.includes('stable sellerId as the business ownership key')],
  ['NO_NAME_AUTH', text.includes('Do not use names (`creatorName`, `sellerName`) as authorization keys')],
  ['BOUNDED_QUERY', text.includes('bounded page/limit')],
  ['CURSOR', text.includes('cursor pagination')],
  ['LEGACY_WINDOW', text.includes('Legacy documents remain readable during a compatibility window')],
  ['NO_RULES_NOW', text.includes('No Firestore Rules modification')],
  ['NO_PROD_WRITE', text.includes('No production notification writes/deletes')],
  ['INDEX_PREREQUISITE', text.includes('create required composite indexes')],
  ['ADVERSARIAL_TESTS', text.includes('test adversarial reads for every role')],
  ['ROLLBACK_GATE', text.includes('rollback is documented')],
];

console.log('S6-C3-B-R5-F2-F RECIPIENT MATRIX & LEGACY COMPATIBILITY DESIGN VALIDATOR');
console.log('MODE=STATIC_READ_ONLY');
console.log('PRODUCTION_WRITES=0');
console.log('AUTH_MUTATIONS=0');
console.log('');
let pass = 0;
for (const [name, re] of checks) {
  const ok = typeof re === 'boolean' ? re : re.test(text);
  if (ok) pass++;
  console.log(`${name}=${ok ? 'PASS' : 'FAIL'}`);
}
console.log('');
console.log(`CHECKS=${checks.length}`);
console.log(`PASSED=${pass}`);
console.log(`FAILED=${checks.length - pass}`);
console.log(`RESULT=${pass === checks.length ? 'DESIGN_VALIDATION_PASS' : 'DESIGN_VALIDATION_FAIL'}`);
console.log('NEXT_STEP=USER_GATE_BEFORE_ANY_RULE_OR_SCHEMA_CHANGE');
