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
  ['PROTOCOL_HAS_SUPERVISOR_SCOPE',
    protocol.includes('SUPERVISOR') &&
    (protocol.includes('own + assigned/managed sellers') ||
     protocol.includes('own + assigned sellers') ||
     protocol.includes('own orders + assigned/managed sellers'))],
  ['PROTOCOL_HAS_SELLER_SCOPE',
    protocol.includes('SELLER') &&
    (protocol.includes('own orders') ||
     protocol.includes('own-order notifications'))],
  ['VALIDATOR_USES_EXPLICIT_SUPERVISOR_ASSERTION',
    validator.includes("protocol.includes('own + assigned/managed sellers')")],
  ['VALIDATOR_USES_EXPLICIT_SELLER_ASSERTION',
    validator.includes("protocol.includes('own orders')")],
];

for (const [name, ok] of checks) {
  console.log(`${name}=${ok ? 'PASS' : 'FAIL'}`);
}
const failed = checks.filter(([, ok]) => !ok).length;
console.log(`CHECKS=${checks.length}`);
console.log(`PASSED=${checks.length - failed}`);
console.log(`FAILED=${failed}`);
process.exitCode = failed ? 1 : 0;
