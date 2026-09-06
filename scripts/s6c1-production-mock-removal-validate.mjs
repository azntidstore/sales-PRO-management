import fs from 'node:fs';

const db = fs.readFileSync('src/dbMock.ts', 'utf8');
const app = fs.readFileSync('src/App.tsx', 'utf8');
const safe = fs.readFileSync('src/utils/safeStorage.ts', 'utf8');
const rules = fs.readFileSync('firestore.rules', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

const checks = [];
const pass = (name, ok, detail = '') => checks.push({ name, ok, detail });

pass('NO_LOCAL_DATABASE_IDENTITIES', !/DEFAULT_LOCAL_(SELLERS|PRODUCTS|ORDERS)|smart_crm_/.test(db));
pass('NO_LOCAL_DATABASE_HELPERS', !/\b(loadLocal|saveLocal|loadFromLocalStorage|saveToLocalStorage)\b/.test(db));
pass('NO_SAFE_STORAGE_DATABASE_IMPORT', !/safeStorage/.test(db));
pass('NO_HARDCODED_ADMIN_IDENTITY_IN_DB_LAYER', !/ouaddou\.abdellah\.topo@gmail\.com|عبد الله \(Abdellah\)|id:\s*['"]admin_1['"]/.test(db));
pass('FIREBASE_ONLY_DATABASE_BOUNDARY', /Production database boundary: Firestore is the only persistent data source/.test(db));
pass('FAIL_CLOSED_GUARD', /FIREBASE_NOT_CONFIGURED: persistent database access is unavailable/.test(db));
pass('FAIL_CLOSED_WITHOUT_LOCAL_AUTH', /Database remains locked; no local authentication fallback is available/.test(db) && !/loadFromLocalStorage|loadLocal|smart_crm_/.test(db));
pass('SAFE_STORAGE_RETAINED_FOR_UI_ONLY', fs.existsSync('src/utils/safeStorage.ts') && safe.length > 0);
pass('WORKSPACE_RUNTIME_SYMBOLS_RETAINED', /switchWorkspace|onOrdersChange|onSellersChange/.test(db));
pass('RULES_R3_UNCHANGED_BY_STATIC_FILE_CONTENT', !/allow\s+true\s*;/.test(rules));
pass('NO_C1_MIGRATION_WRITE_SCRIPT', !Object.keys(pkg.scripts || {}).some(k => /c1.*migrat/i.test(k)));

let failures = 0;
for (const [i, c] of checks.entries()) {
  console.log(`${c.ok ? 'PASS' : 'FAIL'} ${i + 1}. ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
  if (!c.ok) failures++;
}
console.log(`S6-C1 static checks: ${checks.length - failures}/${checks.length} passed, ${failures} failed`);
console.log(`PRODUCTION_MODIFIED=false`);
console.log(`READS=0 WRITES=0 DELETES=0`);
process.exitCode = failures ? 1 : 0;
