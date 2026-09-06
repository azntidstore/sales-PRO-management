import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = [
  'src/types.ts',
  'src/utils/FirestoreService.ts',
  'src/components/OrdersTable.tsx',
  'src/components/SellersManager.tsx',
  'src/App.tsx',
  'firestore.rules'
];

const text = new Map();
for (const rel of files) {
  const p = path.join(root, rel);
  text.set(rel, fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');
}
const all = [...text.entries()].map(([f,t]) => `\n===== ${f} =====\n${t}`).join('\n');

function count(re) { return (all.match(re) || []).length; }
function yes(v) { return v ? 'YES' : 'NO'; }
function lineOf(rel, needle) {
  const t = text.get(rel) || '';
  const i = t.indexOf(needle);
  return i < 0 ? 'NOT_FOUND' : String(t.slice(0, i).split(/\r?\n/).length);
}

console.log('S6-C3-B-R5-F2-E NOTIFICATION SCHEMA & QUERY DESIGN AUDIT');
console.log('MODE=STATIC_READ_ONLY');
console.log('VALUES_PRINTED=0');
console.log('PRODUCTION_WRITES=0');
console.log('AUTH_MUTATIONS=0');
console.log('');
console.log('[1] CURRENT MODEL');
const typeBlock = text.get('src/types.ts') || '';
console.log(`APP_NOTIFICATION_MODEL_EXPLICIT_RECIPIENT_FIELD=${yes(/interface AppNotification[\s\S]{0,1200}recipient|interface AppNotification[\s\S]{0,1200}sellerId|interface AppNotification[\s\S]{0,1200}uid/.test(typeBlock))}`);
console.log(`CREATOR_NAME_FIELD=${yes(/creatorName\??\s*:/.test(typeBlock))}`);
console.log(`ORDER_NOTIFICATION_TYPES=${yes(/order_created.*order_deleted.*order_updated|order_created.*order_updated/.test(typeBlock))}`);
console.log(`SELLER_NOTIFICATION_TYPES=${yes(/seller_created.*seller_deleted|seller_created.*seller_updated.*seller_deleted/.test(typeBlock))}`);
console.log('');
console.log('[2] TRIGGER INVENTORY');
for (const [type, rel, needle] of [
 ['order_deleted','src/components/OrdersTable.tsx',"triggerNotification('order_deleted'"],
 ['order_updated','src/components/OrdersTable.tsx',"triggerNotification('order_updated'"],
 ['seller_updated','src/components/SellersManager.tsx',"triggerNotification('seller_updated'"],
 ['seller_created','src/components/SellersManager.tsx',"triggerNotification('seller_created'"],
 ['seller_deleted','src/components/SellersManager.tsx',"triggerNotification('seller_deleted'"]
]) console.log(`TYPE=${type} SOURCE=${rel}:${lineOf(rel,needle)}`);
console.log('');
console.log('[3] RECIPIENT SIGNALS IN TRIGGERS');
for (const needle of ['sellerId','sellerName','assignedSupervisorId','parentId','parentIds','uid','role','creatorName']) {
  console.log(`${needle.toUpperCase()}_REFERENCED_IN_NOTIFICATION_TRIGGER_FILES=${count(new RegExp(`triggerNotification\\([\\s\\S]{0,1800}${needle}`, 'g'))}`);
}
console.log('');
console.log('[4] CLIENT VISIBILITY LOGIC');
const app = text.get('src/App.tsx') || '';
const orders = text.get('src/components/OrdersTable.tsx') || '';
console.log(`NOTIFICATION_VISIBILITY_FUNCTION=${yes(/isNotificationVisible/.test(app))}`);
console.log(`VISIBILITY_USES_CREATOR_NAME=${yes(/creatorName/.test(app))}`);
console.log(`VISIBILITY_USES_PARENT_ID=${yes(/parentId/.test(app))}`);
console.log(`VISIBILITY_USES_PARENT_IDS=${yes(/parentIds/.test(app))}`);
console.log(`VISIBILITY_USES_CURRENT_ROLE=${yes(/userRole/.test(app))}`);
console.log(`ORDER_NOTIFICATION_CONTAINS_CUSTOMER_FIELDS=${yes(/customerName|phone|address/.test(orders))}`);
console.log('');
console.log('[5] CURRENT QUERY / LISTENER DESIGN');
const fsrv = text.get('src/utils/FirestoreService.ts') || '';
console.log(`NOTIFICATION_REALTIME_LISTENER=${yes(/collection\(db, ['"]notifications['"]\)[\s\S]{0,500}limit\(50\)/.test(fsrv))}`);
console.log(`NOTIFICATION_ORDER_BY_TIMESTAMP=${yes(/notifications[\s\S]{0,500}orderBy\(['"]timestamp['"], ['"]desc['"]\)/.test(fsrv))}`);
console.log(`NOTIFICATION_LIMIT_50=${yes(/notifications[\s\S]{0,500}limit\(50\)/.test(fsrv))}`);
console.log(`NOTIFICATION_RECIPIENT_QUERY_EXISTS=${yes(/notifications[\s\S]{0,1200}(recipient|sellerId|recipientId|uid|scope)/i.test(fsrv))}`);
console.log('');
console.log('[6] RULES');
const rules = text.get('firestore.rules') || '';
const m = rules.match(/match \/notifications\/\{notificationId\}[\s\S]{0,1400}/);
console.log(m ? m[0].split(/\r?\n/).slice(0,18).join('\n') : 'NOTIFICATION_RULE_BLOCK=NOT_FOUND');
console.log('');
console.log('[7] DESIGN CONSTRAINTS');
console.log('LEGACY_NOTIFICATIONS_MUST_BE_PRESERVED=YES');
console.log('PRODUCTION_DELETE_ALLOWED_IN_THIS_AUDIT=NO');
console.log('CLIENT_SIDE_FILTERING_AS_AUTHORIZATION=NO');
console.log('PREFERRED_SCOPE_KEYS=UID_OR_STABLE_SELLER_ID');
console.log('PREFERRED_QUERY=BOUNDED + INDEXABLE + AUTHORIZATION_COMPATIBLE');
console.log('FREE_PLAN_PRIORITY=MINIMIZE_DUPLICATE_REALTIME_READS');
console.log('MULTI_PARENT_SUPPORT_REQUIRED=YES');
console.log('');
console.log('[8] DESIGN DECISION MATRIX — EVIDENCE ONLY');
console.log('ORDER_CREATED=RECIPIENTS_NOT_SAFE_TO_INFER_FROM_CURRENT_NOTIFICATION_SCHEMA_ALONE');
console.log('ORDER_UPDATED=RECIPIENTS_NOT_SAFE_TO_INFER_FROM_CURRENT_NOTIFICATION_SCHEMA_ALONE');
console.log('ORDER_DELETED=RECIPIENTS_NOT_SAFE_TO_INFER_FROM_CURRENT_NOTIFICATION_SCHEMA_ALONE');
console.log('SELLER_CREATED=UI_INTENT_DEPUTY_AND_ADMIN_VISIBLE_BUT_RULES_CURRENTLY_BROAD');
console.log('SELLER_UPDATED=UI_INTENT_DEPUTY_AND_ADMIN_VISIBLE_BUT_RULES_CURRENTLY_BROAD');
console.log('SELLER_DELETED=UI_INTENT_DEPUTY_AND_ADMIN_VISIBLE_BUT_RULES_CURRENTLY_BROAD');
console.log('');
console.log('[9] REQUIRED NEXT DESIGN INPUTS');
console.log('INPUT_1=DEFINE_RECIPIENT_MATRIX_PER_NOTIFICATION_TYPE');
console.log('INPUT_2=CHOOSE_SINGLE_STABLE_SCOPE_KEY_STRATEGY');
console.log('INPUT_3=DEFINE_LEGACY_READ_COMPATIBILITY_WINDOW');
console.log('INPUT_4=DEFINE_INDEX_PLAN_BEFORE_RULE_CHANGE');
console.log('INPUT_5=DEFINE_WRITE_PATH_FOR_FUTURE_NOTIFICATIONS');
console.log('INPUT_6=VERIFY_NO_EXISTING_FEATURE_REQUIRES_GLOBAL_NOTIFICATION_FEED');
console.log('');
console.log('[10] SAFETY');
console.log('FIRESTORE_WRITES=0');
console.log('FIRESTORE_DELETES=0');
console.log('AUTH_MUTATIONS=0');
console.log('RESULT=DESIGN_AUDIT_PASS_REQUIRES_RECIPIENT_MATRIX');
console.log('NEXT_STEP=NO_PRODUCTION_CHANGE');
