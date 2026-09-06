import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const protocol = fs.readFileSync(
  path.join(root, 'S6C3B_R5_F2_F_RECIPIENT_MATRIX_LEGACY_COMPATIBILITY_DESIGN_PROTOCOL.md'),
  'utf8'
);
const validator = fs.readFileSync(
  path.join(root, 'scripts', 's6c3b-r5-f2-f-recipient-matrix-design-validate.mjs'),
  'utf8'
);

const checks = [
  ['PROTOCOL_SUPERVISOR_MATRIX', protocol.includes('SUPERVISOR: own + assigned/managed sellers')],
  ['PROTOCOL_SELLER_MATRIX', protocol.includes('SELLER: own orders')],
  ['VALIDATOR_SUPERVISOR_CHECK', validator.includes("text.includes('SUPERVISOR: own + assigned/managed sellers')")],
  ['VALIDATOR_SELLER_CHECK', validator.includes("text.includes('SELLER: own orders')")],
  ['VALIDATOR_SELLER_EVENTS_CHECK', validator.includes("seller_created | ADMIN: YES | DEPUTY: YES | SUPERVISOR: NO | SELLER: NO")],
];

for (const [name, ok] of checks) console.log(`${name}=${ok ? 'PASS' : 'FAIL'}`);
const failed = checks.filter(([, ok]) => !ok).length;
console.log(`CHECKS=${checks.length}`);
console.log(`PASSED=${checks.length - failed}`);
console.log(`FAILED=${failed}`);
process.exitCode = failed ? 1 : 0;
