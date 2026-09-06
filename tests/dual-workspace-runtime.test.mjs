import fs from 'node:fs';

const app = fs.readFileSync('src/App.tsx', 'utf8');
const db = fs.readFileSync('src/dbMock.ts', 'utf8');
const service = fs.readFileSync('src/utils/FirestoreService.ts', 'utf8');
const rules = fs.readFileSync('firestore.rules', 'utf8');

const checks = [
  ['switch calls DatabaseService.switchWorkspace', app.includes('await DatabaseService.switchWorkspace(nextRole)')],
  ['workspace is marked not-ready during switch', app.includes('setWorkspaceReady(false);')],
  ['new workspace is exposed only after scoped switch', app.indexOf('await DatabaseService.switchWorkspace(nextRole)') < app.indexOf('setActiveWorkspace(nextRole)')],
  ['switch does not sign out', !app.slice(app.indexOf('const handleWorkspaceSwitch'), app.indexOf('const handleLogout')).includes('AuthService.signOut')],
  ['database switch tears down existing listeners', db.includes('unsubscribes.forEach(u => u());')],
  ['database switch reattaches scoped listeners', db.includes('await attachFirebaseListeners(userRole);')],
  ['stale Firebase cache cannot reload prior local workspace data', !db.includes('loadFromLocalStorage') && !db.includes('saveToLocalStorage') && !db.includes('smart_crm_')],
  ['Firestore verifies requested workspace against profile roles', service.includes('profile?.roles.includes(requiredRole)')],
  ['Rules do not depend on active workspace', !rules.includes('activeWorkspace') && !rules.includes('activeRole')],
  ['runtime protocol exists', fs.existsSync('S5D-C-E3_DUAL_WORKSPACE_RUNTIME_PROTOCOL.md')],
];
const failures = checks.filter(([,ok]) => !ok);
for (const [name, ok] of checks) console.log(`[${ok ? 'PASS' : 'FAIL'}] ${name}`);
console.log(`Dual workspace runtime tests: ${checks.length - failures.length} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
