import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const auth = read('src/utils/AuthService.ts');
const rules = read('firestore.rules');
const db = read('src/utils/FirestoreService.ts');
const plan = read('SECURITY_REMEDIATION_PLAN.md');
const protocol = read('S6C2_LEGACY_PROFILE_COMPATIBILITY_AUDIT_PROTOCOL.md');

let failures = 0;
function check(n, ok, detail) {
  if (ok) console.log(`PASS ${n}. ${detail}`);
  else { console.log(`FAIL ${n}. ${detail}`); failures++; }
}

check(1, /doc\(db, 'users', authenticatedUid\)/.test(auth), 'AUTH_PROFILE_LOOKUP_IS_UID_KEYED');
check(2, /authProfile\.uid !== authenticatedUid/.test(auth) && /!authProfile\.sellerId/.test(auth) && /!authProfile\.role/.test(auth), 'AUTH_PROFILE_VALIDATES_UID_SELLER_ROLE');
check(3, /doc\(db, 'sellers', authProfile\.sellerId\)/.test(auth), 'CANONICAL_SELLER_LOOKUP_USES_PROFILE_SELLER_ID');
check(4, /Seller UID mismatch detected\. Access denied\./.test(auth), 'SELLER_UID_MISMATCH_IS_REJECTED');
check(5, /STAGED COMPATIBILITY: legacy UID-linked seller lookup/.test(auth) && /where\('uid', '==', authenticatedUid\)/.test(auth), 'LEGACY_UID_QUERY_IS_EXPLICITLY_STAGED');
check(6, /Direct document ID lookup \(doc\(db, 'sellers', authenticatedUid\)\)/.test(auth), 'LEGACY_DIRECT_SELLER_UID_LOOKUP_IS_IDENTIFIED');
check(7, !/loadFromLocalStorage|saveToLocalStorage|smart_crm_|DEFAULT_LOCAL_/.test(auth), 'AUTH_SERVICE_HAS_NO_LOCAL_DATABASE_FALLBACK');
check(8, !/activeWorkspace|activeRole/.test(rules), 'RULES_DO_NOT_USE_CLIENT_WORKSPACE_AS_AUTHORITY');
check(9, /match \/users\/{uid}/.test(rules) && /request\.auth\.uid/.test(rules), 'RULES_USE_UID_KEYED_AUTH_PROFILE');
check(10, /S6-C2/.test(plan) && /no migration/i.test(protocol) && /No Firestore writes, updates, deletes/.test(protocol) && /Auth account mutations/.test(protocol), 'C2_IS_AUDIT_ONLY_NO_MIGRATION');
check(11, /getAuthorizationProfile\(/.test(db), 'DATABASE_LAYER_USES_AUTHORIZATION_PROFILE');

console.log(`S6-C2 static checks: ${11 - failures}/11 passed, ${failures} failed`);
console.log('PRODUCTION_MODIFIED=false');
console.log('READS=0 WRITES=0 DELETES=0');
process.exitCode = failures ? 1 : 0;
