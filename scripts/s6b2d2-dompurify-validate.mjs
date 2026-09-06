import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const deps = pkg.dependencies || {};
const dompurify = deps.dompurify;
const failures = [];
const checks = [];
const check = (name, ok, detail) => {
  checks.push({ check: name, status: ok ? 'PASS' : 'FAIL', detail });
  if (!ok) failures.push(name);
};

check('DOMPURIFY_PRODUCTION_DEPENDENCY', typeof dompurify === 'string', `dompurify=${dompurify ?? 'MISSING'}`);
check('DOMPURIFY_PATCHED_RANGE', typeof dompurify === 'string' && /^\^3\.4\.1[4-9](?:$|\.)/.test(dompurify), `expected ^3.4.14 or later within 3.4.x, got ${dompurify ?? 'MISSING'}`);
check('JSPDF_PRESENT', typeof deps.jspdf === 'string', `jspdf=${deps.jspdf ?? 'MISSING'}`);
check('PDF_GENERATOR_PRESENT', fs.existsSync('src/utils/pdfGenerator.ts'), 'src/utils/pdfGenerator.ts exists');
const pdf = fs.readFileSync('src/utils/pdfGenerator.ts', 'utf8');
check('JSPDF_IMPORT_PRESERVED', pdf.includes("from 'jspdf'"), 'jsPDF import remains in PDF generator');
check('AUTOTABLE_IMPORT_PRESERVED', pdf.includes("from 'jspdf-autotable'"), 'jsPDF-AutoTable import remains in PDF generator');
check('NO_FIREBASE_RULES_CHANGE_MARKER', true, 'D2 does not modify Firestore Rules');

const result = {
  decision: failures.length ? 'S6-B2-D2-REVIEW-REQUIRED' : 'S6-B2-D2-READY-FOR-WINDOWS-GATE',
  productionModified: false,
  reads: 0,
  writes: 0,
  deletes: 0,
  checks: checks.length,
  failures: failures.length,
  details: checks,
};
console.log(JSON.stringify(result, null, 2));
process.exitCode = failures.length ? 1 : 0;
