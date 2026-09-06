import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const ROOT = process.cwd();
const SCAN_ROOTS = ['src', 'scripts', 'tests'];
const EXTS = new Set(['.ts','.tsx','.js','.jsx','.mjs','.cjs']);
const IGNORE = new Set(['node_modules','.git','dist','build']);

const files = [];
function walk(dir) {
  let entries = [];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (IGNORE.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (EXTS.has(extname(e.name).toLowerCase())) files.push(p);
  }
}
for (const root of SCAN_ROOTS) walk(join(ROOT, root));

const patterns = [
  { key: 'dotPassword', re: /\.password\b/g },
  { key: 'passwordProperty', re: /\bpassword\s*[:?]/g },
  { key: 'passwordFieldString', re: /['"]password['"]/g },
  { key: 'sellerPasswordPhrase', re: /seller[^\n]{0,80}password|password[^\n]{0,80}seller/gi },
  { key: 'passwordComparison', re: /(?:===|!==|==|!=)\s*[^;\n]{0,100}password|password[^;\n]{0,100}(?:===|!==|==|!=)/gi },
  { key: 'passwordPersistWrite', re: /(?:setDoc|addDoc|updateDoc|set\()\s*\([^\n]{0,250}password/gi },
];

const findings = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const p of patterns) {
    const matches = [...text.matchAll(p.re)];
    if (!matches.length) continue;
    for (const m of matches) {
      const line = text.slice(0, m.index).split('\n').length;
      const raw = text.split('\n')[line - 1]?.trim() ?? '';
      const safe = raw.replace(/(['"]?password['"]?\s*[:=]\s*)[^,;)}]+/gi, '$1[REDACTED_LITERAL]');
      findings.push({ file: relative(ROOT,file).replaceAll('\\','/'), line, key:p.key, text:safe.slice(0,240) });
    }
  }
}

const authService = readFileSync(join(ROOT,'src/utils/AuthService.ts'),'utf8');
const dbMock = readFileSync(join(ROOT,'src/dbMock.ts'),'utf8');
const typeFiles = files.filter(f => /types?|models?|interfaces?/i.test(f));
let typePasswordRefs = 0;
for (const f of typeFiles) {
  const t = readFileSync(f,'utf8');
  if (/password\??\s*[:?]/i.test(t)) typePasswordRefs++;
}

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1');
}
const authCode = stripComments(authService);
const dbCode = stripComments(dbMock);
const sourceFindings = findings.filter(f => !f.file.startsWith('scripts/s6c3b-'));
const authSellerPasswordAccess = /(?:seller|profile|data|doc|snapshot)[^\n]{0,120}\.password\b|\.password\b[^\n]{0,120}(?:seller|profile|data|doc|snapshot)/i.test(authCode);
const checks = [
  ['Firebase Auth sign-in is used', /signInWithEmailAndPassword\s*\(/.test(authCode)],
  ['AuthService does not read sellers.password', !authSellerPasswordAccess],
  ['AuthService does not query sellers by password', !/where\s*\(\s*['"]password['"]/i.test(authCode)],
  ['AuthService has password reset through Firebase Auth', /sendPasswordResetEmail\s*\(/.test(authCode)],
  ['dbMock does not persist password locally', !/(localStorage|sessionStorage)/i.test(dbCode) || !/password/i.test(dbCode)],
  ['No createUserWithEmailAndPassword in current AuthService', !/createUserWithEmailAndPassword/.test(authCode)],
  ['No direct password comparison in AuthService', !/(?:password\b[^\n]{0,80}(?:===|!==|==|!=)|(?:===|!==|==|!=)[^\n]{0,80}password\b)/i.test(authCode)],
];

console.log('S6-C3-B-R2 LEGACY PASSWORD DEPENDENCY AUDIT');
console.log('MODE=STATIC_READ_ONLY');
console.log(`FILES_SCANNED=${files.length}`);
console.log(`PASSWORD_TYPE_FILES=${typePasswordRefs}`);
console.log(`TOTAL_PASSWORD_FINDINGS=${sourceFindings.length}`);
console.log('');
console.log('CHECKS');
for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}=${name}`);
console.log('');
console.log('FINDINGS');
if (!sourceFindings.length) console.log('(none)');
else for (const f of sourceFindings) console.log(`${f.file}:${f.line} [${f.key}] ${f.text}`);
console.log('');
console.log('INTERPRETATION_RULES');
console.log('1=No production data was read or modified by this audit.');
console.log('2=Any password field used only by login UI/Firebase Auth is not a sellers.password dependency.');
console.log('3=Any seller model, mapping, write/update, comparison, import/export, sync, or migration dependency must be reviewed before field removal.');
console.log('4=No password values are printed by this audit.');
console.log(`RESULT=${checks.every(([,ok])=>ok) ? 'STATIC_PASS_REVIEW_FINDINGS' : 'STATIC_REVIEW_REQUIRED'}`);
