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
  ['SUPERVISOR_SCOPE_LITERAL', /SUPERVISOR.*own \+ assigned\|managed/i.test(protocol)],
  ['SELLER_SCOPE_LITERAL', /SELLER.*own orders/i.test(protocol)],
  ['VALIDATOR_ESCAPES_LITERAL_PLUS', /own \\+ assigned/i.test(validator)],
];

for (const [name, ok] of checks) console.log(`${name}=${ok ? 'PASS' : 'FAIL'}`);
const failed = checks.filter(([, ok]) => !ok).length;
console.log(`CHECKS=${checks.length}`);
console.log(`FAILED=${failed}`);
process.exitCode = failed ? 1 : 0;
