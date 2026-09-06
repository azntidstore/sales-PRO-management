import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
let checks = 0, failures = 0;
const check = (name, ok, detail='') => { checks++; if (!ok) failures++; console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`); };

const prodDeps = {...(pkg.dependencies || {})};
const devDeps = {...(pkg.devDependencies || {})};
check('PROTOBUF_NOT_DIRECT_PRODUCTION_DEPENDENCY', !('protobufjs' in prodDeps));
check('PROTOBUF_NOT_DIRECT_DEV_DEPENDENCY', !('protobufjs' in devDeps));

const lockEntry = lock.packages?.['node_modules/protobufjs'];
check('PROTOBUF_LOCK_ENTRY_PRESENT', Boolean(lockEntry));
if (lockEntry) {
  const v = lockEntry.version;
  const parts = v.split('.').map(Number);
  const patched = parts[0] === 7 && (parts[1] > 6 || (parts[1] === 6 && parts[2] >= 5));
  check('PROTOBUF_PATCHED_7X', patched, `resolved=${v}`);
  check('PROTOBUF_NOT_MAJOR_8_MIGRATION', parts[0] === 7, `resolved=${v}`);
}

function walk(dir) {
  let out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, {withFileTypes:true})) {
    if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === 'dist') continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out = out.concat(walk(p));
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(ent.name)) out.push(p);
  }
  return out;
}
const sourceFiles = walk(path.join(root, 'src')).concat(walk(path.join(root, 'scripts')).concat(walk(path.join(root, 'tests'))));
const refs = [];
for (const file of sourceFiles) {
  const text = fs.readFileSync(file, 'utf8');
  if (/from\s+['"]protobufjs(?:\/|['"])/.test(text) || /require\(\s*['"]protobufjs(?:\/|['"])/.test(text)) refs.push(path.relative(root,file));
}
check('NO_DIRECT_PROTOBUFJS_APP_IMPORT', refs.length === 0, refs.join(', '));

const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
check('NO_UNCONDITIONAL_ALLOW_TRUE', !/allow\s+(read|write|create|update|delete)\s*:\s*true\s*;/.test(rules));

console.log(`S6-B2-D3 static validator: ${checks - failures}/${checks} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
