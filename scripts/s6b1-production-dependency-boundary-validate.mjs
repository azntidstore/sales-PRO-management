import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const failures = [];
const details = [];
const add = (ok, check, detail) => {
  details.push({ check, status: ok ? 'PASS' : 'FAIL', detail });
  if (!ok) failures.push(check);
};
const deps = pkg.dependencies ?? {};
const dev = pkg.devDependencies ?? {};
const rootLock = lock.packages?.[''] ?? {};

add(!Object.prototype.hasOwnProperty.call(deps, 'express'), 'EXPRESS_NOT_PROD', 'express is not a production dependency');
add(Object.prototype.hasOwnProperty.call(dev, 'firebase-admin'), 'FIREBASE_ADMIN_DEV_ONLY', 'firebase-admin is a development dependency');
add(!Object.prototype.hasOwnProperty.call(deps, 'firebase-admin'), 'FIREBASE_ADMIN_NOT_PROD', 'firebase-admin is not a production dependency');
add(Object.prototype.hasOwnProperty.call(dev, 'dotenv'), 'DOTENV_DEV_ONLY', 'dotenv is a development dependency');
add(!Object.prototype.hasOwnProperty.call(deps, 'dotenv'), 'DOTENV_NOT_PROD', 'dotenv is not a production dependency');

const srcText = fs.readdirSync(path.join(root, 'src'), { recursive: true })
  .filter((p) => /\.(ts|tsx|js|jsx|mjs)$/.test(p))
  .map((p) => fs.readFileSync(path.join(root, 'src', p), 'utf8'))
  .join('\n');
add(!/['"]firebase-admin(?:\/|['"])/.test(srcText), 'NO_FIREBASE_ADMIN_IN_SRC', 'firebase-admin is absent from src/');
add(!/(^|[^\w])express([^\w]|$)/m.test(srcText), 'NO_EXPRESS_IN_SRC', 'express is absent from src/');
add(!/['"]dotenv(?:\/|['"])/.test(srcText), 'NO_DOTENV_IN_SRC', 'dotenv is absent from src/');

const pkgNames = new Set([...Object.keys(deps), ...Object.keys(dev)]);
const lockNames = new Set([
  ...Object.keys(rootLock.dependencies ?? {}),
  ...Object.keys(rootLock.devDependencies ?? {}),
]);
const missing = [...pkgNames].filter((x) => !lockNames.has(x));
add(missing.length === 0, 'LOCK_ROOT_SYNC', missing.length ? `missing: ${missing.join(', ')}` : 'all direct dependencies represented in lock root');

add(fs.existsSync(path.join(root, 'S6B1_PRODUCTION_DEPENDENCY_BOUNDARY_PROTOCOL.md')), 'S6B1_PROTOCOL', 'S6-B1 protocol exists');

console.log(JSON.stringify({
  decision: failures.length ? 'S6-B1-BOUNDARY-REVIEW-REQUIRED' : 'S6-B1-READY-FOR-WINDOWS-GATE',
  productionModified: false,
  reads: 0,
  writes: 0,
  deletes: 0,
  checks: details.length,
  failures: failures.length,
  details,
}, null, 2));
process.exit(failures.length ? 1 : 0);
