# SELLERPRO — خطة العمل المحدثة
## 2026-09-05

> هذه الوثيقة هي خطة العمل فقط. لا تتضمن أي تعديل على كود التطبيق أو قاعدة البيانات.

---

## 1. الحالة الحالية

### المراحل المكتملة

- S1 — Authentication
- S2 — Firestore Authorization
- S4 — Data Migration
- S5 — Read / Persistence / Concurrency Gates
- S6-A — Dependency Audit
- S6-B1
- S6-B2-C/D1/D2/D3
- S6-C1 — Production Mock Removal
- S6-C2
- S6-C3-B — Password Forensics
- R2 — Legacy Password Dependency Audit
- R3 — Password Removal Dry-Run
- R4 — Password Removal
- R5 — Sensitive Data Exposure Read Scope Audit
- F2-F1 — Product Financial Field Exposure
- F2-F2 — Notification Scope Audit
- F2-D — Authorization Design Audit
- F2-E — Schema / Query Design Audit
- F2-F — Recipient Matrix
- F2-G — Implementation Preflight
- F2-H — Implementation Audit
- H-R1 — Gap Analysis
- F2-I — Notification Removal Preflight
- F2-J — Notification Source Removal
- F2-J-R4 — Final Gate
- F2-K1 — Backup / Discovery
- F2-K2 — True Dry-Run
- F2-K3 — Quota Preflight
- F2-K4 — Controlled Notification Deletion
- F2-K5 — Final Reconciliation
- F2-K6-R1 → R5 — Final Notification Cleanup Audit

### الحالة

**F2-K = COMPLETE / PASS**

Notification documents: **0**

---

# 2. الميزات الجديدة المطلوبة

## Feature 1 — ربط المنتجات بالمشرفين

إضافة إمكانية ربط المنتج بمشرف واحد أو أكثر.

المتطلبات:

- المنتج يمكن أن يكون مرتبطًا بمشرف واحد.
- المنتج يمكن أن يكون مرتبطًا بعدة مشرفين.
- يجب أن يكون الربط محفوظًا في Firestore بطريقة قابلة للاستعلام.
- لا يعتمد النظام على تصفية ضخمة داخل المتصفح.
- يجب تحديث Firestore Rules وفق صلاحيات المستخدم.
- يجب الحفاظ على صلاحيات ADMIN / نائب المدير / SELLER الحالية.

---

## Feature 2 — تصفية المنتجات حسب المشرف

عند إنشاء طلبية جديدة:

1. يختار البائع المشرف المسؤول.
2. قائمة المنتجات تعرض فقط المنتجات المرتبطة بهذا المشرف.
3. لا يتم تحميل جميع المنتجات ثم تصفيتها محليًا إذا أمكن تجنب ذلك.
4. يجب استخدام Query مناسبة لتقليل Firestore reads.
5. يجب منع العميل من تجاوز التصفية أو إرسال productId غير مسموح به.
6. يجب التحقق من علاقة:
   - seller
   - supervisor
   - product
   - order

---

## Feature 3 — الطلبية متعددة المنتجات

بدل إنشاء طلب منفصل لكل منتج:

- نافذة واحدة لإنشاء الطلبية.
- اختيار عدة منتجات داخل الطلبية.
- كل منتج يمكن أن تكون له كمية وسعر مناسب.
- تكلفة التوصيل تكون واحدة للطلبية.
- المنتجات تشترك في معرف طلبية واحد.
- جدول الطلبيات يوضح أن المنتجات تنتمي إلى نفس الطلبية.
- إضافة مؤشر/رقم/علامة بصرية لتمييز المنتجات التابعة لنفس الطلبية.
- يجب الحفاظ على الحسابات المالية الصحيحة.
- يجب الحفاظ على snapshots المالية عند الحاجة.
- يجب منع تعديل القيم المالية الموثوقة من العميل.
- يجب عدم كسر اختبارات S3.

### مبدأ البيانات

الأفضل تصميم:

Order / Order Group
    ├── Product Item 1
    ├── Product Item 2
    └── Product Item 3

بحيث تكون تكلفة التوصيل مرتبطة بالطلبية وليس مكررة بشكل خاطئ على كل منتج.

---

# 3. Feature 4 — Sessions / Settlement / Archive

الهدف:

تمكين المدير من إغلاق حساب/جلسة البائع بعد تسوية أرباحه.

عند إغلاق Session:

- تحديد البائع.
- تحديد الفترة الزمنية.
- حساب عدد الطلبيات.
- حساب الأرباح.
- إنشاء كشف/فاتورة مفصلة.
- تسجيل إجمالي التسوية.
- إغلاق الجلسة ومنع تعديل الطلبات التابعة لها.
- اعتبار الطلبات ضمن الأرشيف منطقيًا.
- الأرشيف متاح للمدير ونوابه فقط.
- بدء Session جديدة للطلبات اللاحقة.

### مهم

الأرشفة لا تعني تلقائيًا حذف الطلبات من Firestore أو إعادة كتابتها في Collection أخرى.

التصميم المفضل:

Seller
  ├── Session 1
  │     ├── Order
  │     ├── Order
  │     └── Order
  │
  ├── Session 2
  │     ├── Order
  │     └── Order
  │
  └── Session 3
        └── Order

مع حالة واضحة للجلسة:

- OPEN
- CLOSED

ويتم ربط الطلب بالـ sessionId.

---

# 4. ترتيب التنفيذ

## S6-D — Hardening

### D1 — Security Configuration Audit

مراجعة:

- Firebase configuration
- Firestore Rules
- Authentication
- roles
- seller identity
- service-account exposure
- environment variables
- endpoints
- server code

**Audit فقط في البداية.**

### D2 — Client Trust Boundary

منع العميل من فرض:

- role
- sellerId
- userId
- createdBy
- approvedBy
- status الحساس
- القيم المالية
- أي بيانات يجب أن يقررها النظام.

### D3 — Financial Integrity Hardening

مراجعة:

- wholesalePrice
- wholesalePriceSnapshot
- sellingPrice
- deliveryCost
- profit
- order total
- تعديل الأسعار بعد إنشاء الطلب

مع الحفاظ على wholesalePrice للـ SELLER وفق التصميم الحالي.

### D4 — Firestore Query / Read Hardening

مراجعة:

- getDocs غير الضرورية
- read-all ثم filtering
- listeners الدائمة
- queries غير المقيدة
- إعادة القراءة غير الضرورية
- cache / state reuse عند الحاجة

الهدف:

**تقليل Firestore reads مع الحفاظ على الأمان والصحة.**

### D5 — Abuse / Input Hardening

مراجعة:

- النصوص
- IDs
- الأسعار
- الكميات
- الحالات
- timestamps
- pagination
- query manipulation
- التكرار الضار للعمليات

### D6 — Dependency / Build Security

مراجعة:

- dependencies
- package-lock
- secrets
- service accounts
- production build
- bundle
- source exposure

لا يتم تشغيل:

- npm install
- npm ci
- npm audit fix

إلا بعد التحقق من حالة package.json وpackage-lock.

### D7 — Security Regression Gate

إعادة اختبارات:

- S2 Authorization
- S3 Financial Integrity
- Auth
- Rules
- sensitive data scope
- notification removal
- build

---

# 5. Feature Design

بعد S6-D وقبل S7 النهائي:

## FD1 — Product ↔ Supervisor

تحديد schema والعلاقات والاستعلامات.

## FD2 — Supervisor → Product Query

تصميم query قليلة القراءة ومحمية بالـ Rules.

## FD3 — Multi-product Order

تحديد:

- order identity
- order items
- delivery cost
- totals
- profit
- snapshots
- status
- display grouping

## FD4 — Seller Sessions / Settlement

تحديد:

- sessionId
- OPEN / CLOSED
- opening / closing timestamps
- settlement calculation
- invoice
- archive access
- prevention of post-close mutation

## FD5 — Rules & Authorization

تحديث التصميم الأمني للميزات الأربع.

## FD6 — Firestore Cost / Read Impact

قياس عدد القراءات والكتابات المتوقعة قبل التنفيذ.

## FD7 — Compatibility / No Migration

الحفاظ على البيانات الحالية وعدم تنفيذ migrations غير ضرورية.

---

# 6. Feature Implementation

## FI1 — Product / Supervisor Assignment

تنفيذ الربط.

## FI2 — Supervisor Product Filtering

تنفيذ التصفية الآمنة.

## FI3 — Multi-product Orders

تنفيذ الطلبية متعددة المنتجات.

## FI4 — Sessions / Settlement / Archive

تنفيذ نظام الجلسات والتسوية والأرشيف.

كل Feature تمر باختبار مستقل قبل الانتقال للتالية.

---

# 7. Feature Validation

## FV1

Product ↔ Supervisor integrity

## FV2

Supervisor product query

## FV3

Unauthorized product access

## FV4

Multi-product order creation

## FV5

Single delivery cost

## FV6

Correct totals / profit

## FV7

Order grouping display

## FV8

Session opening / closing

## FV9

Settlement / invoice accuracy

## FV10

Archive authorization + closed-session immutability

---

# 8. S7 — FINAL PRODUCTION SECURITY AUDIT

### S7-A
Full Source Audit

### S7-B
Firestore Rules Final Audit

### S7-C
Authentication Final Audit

### S7-D
Sensitive Data Exposure Audit

### S7-E
Financial Integrity Final Audit

### S7-F
Firestore Cost / Reads Audit

### S7-G
Backup / Recovery Verification

### S7-H
Final Regression

---

# 9. Production Readiness Review

لا يتم إعلان Production Ready إلا بعد:

- Security PASS
- Data Integrity PASS
- Authentication PASS
- Firestore Rules PASS
- Financial Integrity PASS
- Firestore Reads acceptable
- Backup / Recovery PASS
- Build PASS
- Regression PASS
- No critical findings

ثم:

# PRODUCTION READY

---

# 10. قاعدة العمل

- لا ننتقل بين المراحل دون موافقة صريحة.
- كل مرحلة تبدأ بـ Audit/Preflight قبل التعديل عندما يكون ذلك مناسبًا.
- بعد كل تعديل: Diagnostic شامل.
- لا حذف بيانات إنتاجية دون Backup + Dry-run + Reconciliation.
- لا plaintext passwords.
- لا client-side authentication source.
- لا client-trusted role.
- لا client-trusted financial totals.
- لا service-account credentials داخل source/Git/frontend.
- لا migrations غير ضرورية.
- لا read-all ثم filtering إذا أمكن تنفيذ Query آمنة ومحددة.
- لا نعيد Notifications.
- لا نكسر wholesalePrice للـ SELLER.
- لا نعلن Production Ready قبل S7 الكامل.

---

## نقطة التوقف الحالية

**F2-K = COMPLETE / PASS**

**المرحلة التالية: S6-D1 — Security Configuration Audit**

الميزات الجديدة تم إدراجها في الخطة، لكن لم يتم تعديل كود التطبيق لتنفيذها بعد.
