import fs from 'fs';
import path from 'path';

const ROOT = path.resolve('src');

const TARGETS = [
  'fetchSellerProfile',
  "where('uid'",
  'where("uid"',
  "doc(db, 'sellers'",
  'doc(db, "sellers"',
  "collection('sellers')",
  'collection("sellers")',
  'sellers/{uid}',
  'authenticatedUid',
];

const EXCLUDE = [
  'node_modules',
  'dist',
  'build',
];

function walk(dir) {
  const result = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (EXCLUDE.includes(entry.name)) {
      continue;
    }

    if (entry.isDirectory()) {
      result.push(...walk(full));
    } else if (
      /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)
    ) {
      result.push(full);
    }
  }

  return result;
}

const files = walk(ROOT);

const hits = [];

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);

  lines.forEach((line, index) => {
    for (const target of TARGETS) {
      if (line.includes(target)) {
        hits.push({
          file: path.relative(process.cwd(), file),
          line: index + 1,
          target,
          code: line.trim(),
        });
      }
    }
  });
}

const fetchCalls = hits.filter(
  (h) => h.target === 'fetchSellerProfile'
);

const legacyUidQueries = hits.filter(
  (h) =>
    h.target === "where('uid'" ||
    h.target === 'where("uid"'
);

const directSellerDocs = hits.filter(
  (h) =>
    h.target === "doc(db, 'sellers'" ||
    h.target === 'doc(db, "sellers"'
);

const sellerCollections = hits.filter(
  (h) =>
    h.target === "collection('sellers')" ||
    h.target === 'collection("sellers")'
);

const authenticatedUidRefs = hits.filter(
  (h) => h.target === 'authenticatedUid'
);

const result = {
  audit: 'S6-D1-D3',
  mode: 'STATIC_READ_ONLY',
  sourceRoot: 'src',
  filesScanned: files.length,

  fetchSellerProfileReferences: fetchCalls.length,
  legacyUidQueryReferences: legacyUidQueries.length,
  directSellerDocumentReferences: directSellerDocs.length,
  sellersCollectionReferences: sellerCollections.length,
  authenticatedUidReferences: authenticatedUidRefs.length,

  totalLegacyPatternHits: hits.length,

  result:
    hits.length >= 0
      ? 'REVIEW_REQUIRED'
      : 'FAIL',

  hits,
};

fs.mkdirSync('artifacts', { recursive: true });

fs.writeFileSync(
  'artifacts/s6d1-d3-static-legacy-auth-dependency-audit.json',
  JSON.stringify(result, null, 2)
);

console.log('==================================================');
console.log('S6-D1-D3 STATIC LEGACY AUTH DEPENDENCY AUDIT');
console.log('==================================================');

console.log('AUDIT=' + result.audit);
console.log('MODE=' + result.mode);
console.log('SOURCEROOT=' + result.sourceRoot);
console.log('FILESSCANNED=' + result.filesScanned);
console.log(
  'FETCHSELLERPROFILEREFERENCES=' +
    result.fetchSellerProfileReferences
);
console.log(
  'LEGACYUIDQUERYREFERENCES=' +
    result.legacyUidQueryReferences
);
console.log(
  'DIRECTSELLERDOCUMENTREFERENCES=' +
    result.directSellerDocumentReferences
);
console.log(
  'SELLERSCOLLECTIONREFERENCES=' +
    result.sellersCollectionReferences
);
console.log(
  'AUTHENTICATEDUIDREFERENCES=' +
    result.authenticatedUidReferences
);
console.log(
  'TOTALLEGACYPATTERNHITS=' +
    result.totalLegacyPatternHits
);

console.log('[HITS]');

console.log(
  JSON.stringify(hits, null, 2)
);

console.log('==================================================');