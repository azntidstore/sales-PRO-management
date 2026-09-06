#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sourceFiles = [
  'src/App.tsx',
  'src/dbMock.ts',
  'src/types.ts',
  'src/utils/FirestoreService.ts',
  'src/components/OrderFormModal.tsx',
  'src/components/OrdersTable.tsx',
  'src/components/SellersManager.tsx',
  'firestore.rules'
];

const required = [
  'src/App.tsx',
  'src/dbMock.ts',
  'src/types.ts',
  'src/utils/FirestoreService.ts',
  'src/components/OrderFormModal.tsx',
  'src/components/OrdersTable.tsx',
  'src/components/SellersManager.tsx',
  'firestore.rules'
];

let passed = 0, failed = 0;
function check(name, ok) {
  console.log(`${name}=${ok ? 'PASS' : 'FAIL'}`);
  ok ? passed++ : failed++;
}
const text = new Map();
for (const rel of sourceFiles) {
  const p = path.join(root, rel);
  text.set(rel, fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');
}
check('FILES_PRESENT', required.every(r => text.get(r).length > 0));

const combined = [...text.entries()].map(([f,t]) => `\n###${f}\n${t}`).join('\n');
const notifRef = /\b(?:AppNotification|triggerNotification|onNotificationsChange|saveNotification)\b|['"`]notifications['"`]|match\s+\/notifications\//i;
check('NO_NOTIFICATION_RUNTIME_REFERENCES', !notifRef.test(combined));
check('NO_NOTIFICATION_COLLECTION_REFERENCE', !/\bnotifications\b/i.test(text.get('src/utils/FirestoreService.ts') + text.get('src/dbMock.ts') + text.get('src/App.tsx')));
check('NO_NOTIFICATION_MODEL', !/\binterface\s+AppNotification\b/i.test(text.get('src/types.ts')));
check('NO_NOTIFICATION_RULE_BLOCK', !/match\s+\/notifications\/\{notificationId\}/i.test(text.get('firestore.rules')));
check('NO_ORDER_NOTIFICATION_TRIGGERS', !/triggerNotification\s*\(/i.test(text.get('src/components/OrderFormModal.tsx') + text.get('src/components/OrdersTable.tsx')));
check('NO_SELLER_NOTIFICATION_TRIGGERS', !/triggerNotification\s*\(/i.test(text.get('src/components/SellersManager.tsx')));
check('ORDER_FUNCTIONALITY_PRESENT', /DatabaseService\.(createOrder|updateOrder|deleteOrder|getOrders)\b/.test(text.get('src/components/OrderFormModal.tsx') + text.get('src/components/OrdersTable.tsx')));
check('SELLER_FUNCTIONALITY_PRESENT', /DatabaseService\.(createSeller|updateSeller|deleteSeller|getSellers)\b/.test(text.get('src/components/SellersManager.tsx')));
check('PRODUCT_WHOLESALE_PRESERVED', /wholesalePrice/.test(text.get('src/components/OrderFormModal.tsx') + text.get('src/components/ProductsManager.tsx') + text.get('src/utils/orderFinancials.ts')));
check('NO_LEGACY_DELETE_SCRIPT_IN_PATCH', !/delete.*notifications|notifications.*delete/i.test(combined));
check('NO_AUTH_MUTATION_IN_PATCH', !/\b(?:createUser|deleteUser|updateUser|sendPasswordResetEmail|updatePassword)\b/i.test(combined));

console.log(`CHECKS=${passed + failed}`);
console.log(`PASSED=${passed}`);
console.log(`FAILED=${failed}`);
console.log(`RESULT=${failed === 0 ? 'SOURCE_REMOVAL_VALIDATION_PASS' : 'SOURCE_REMOVAL_VALIDATION_FAIL'}`);
process.exit(failed ? 1 : 0);
