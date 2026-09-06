import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const failures = [];
const details = [];
const add = (ok, check, detail) => { details.push({ check, status: ok ? 'PASS' : 'FAIL', detail }); if (!ok) failures.push(check); };
const deps = pkg.dependencies ?? {};
const dev = pkg.devDependencies ?? {};
const rootLock = lock.packages?.[''] ?? {};
const buildOnly = ['vite', '@vitejs/plugin-react', '@tailwindcss/vite'];
for (const name of buildOnly) {
  add(!Object.hasOwn(deps, name), `${name}_NOT_PROD`, `${name} is absent from production dependencies`);
  add(Object.hasOwn(dev, name), `${name}_DEV_ONLY`, `${name} is present in devDependencies`);
}
const missing = [...new Set([...Object.keys(deps), ...Object.keys(dev)])].filter((x) => !Object.hasOwn(rootLock.dependencies ?? {}, x) && !Object.hasOwn(rootLock.devDependencies ?? {}, x));
add(missing.length === 0, 'LOCK_ROOT_SYNC', missing.length ? `missing: ${missing.join(', ')}` : 'all direct package.json dependencies are represented in lock root');
const srcFiles = fs.readdirSync(path.join(root, 'src'), { recursive: true }).filter(p => /\.(ts|tsx|js|jsx|mjs)$/.test(p));
const srcText = srcFiles.map(p => fs.readFileSync(path.join(root, 'src', p), 'utf8')).join('\n');
for (const name of buildOnly) add(!new RegExp(`['"]${name.replace('/', '\\/')}(?:/|['"])`).test(srcText), `NO_${name.replace(/[^A-Za-z0-9]/g,'_')}_SRC_RUNTIME_IMPORT`, `${name} has no direct runtime import in src/`);
add(fs.existsSync(path.join(root, 'S6B2D1_BUILD_DEPENDENCY_BOUNDARY_PROTOCOL.md')), 'D1_PROTOCOL', 'D1 protocol exists');
const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
add(!/allow\s+[A-Za-z*]+\s*:\s*true/.test(rules), 'NO_UNCONDITIONAL_ALLOW_TRUE', 'no unconditional allow true');
console.log(JSON.stringify({decision: failures.length ? 'S6-B2-D1-REVIEW-REQUIRED' : 'S6-B2-D1-READY-FOR-WINDOWS-GATE', productionModified:false, reads:0,writes:0,deletes:0,checks:details.length,failures:failures.length,details}, null, 2));
process.exit(failures.length ? 1 : 0);
