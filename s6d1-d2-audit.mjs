import fs from 'fs';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const SERVICE = 'D:/Sellernvcle/seller-manager-admin.json.json';
const PROJECT = 'seller-pro-management';

const sa = JSON.parse(fs.readFileSync(SERVICE, 'utf8'));

if (sa.project_id !== PROJECT) {
  throw new Error('WRONG_PROJECT');
}

const app =
  getApps()[0] ||
  initializeApp({
    credential: cert(sa),
    projectId: PROJECT,
  });

const db = getFirestore(app);
const auth = getAuth(app);

const sellersSnap = await db.collection('sellers').get();

const sellers = sellersSnap.docs.map((doc) => ({
  id: doc.id,
  ...doc.data(),
}));

const authUsers = [];

let pageToken;

do {
  const page = await auth.listUsers(1000, pageToken);

  for (const user of page.users) {
    authUsers.push({
      uid: user.uid,
      email: user.email || null,
      disabled: user.disabled,
      providerCount: user.providerData?.length || 0,
    });
  }

  pageToken = page.pageToken;
} while (pageToken);

const byUid = new Map(
  authUsers.map((user) => [user.uid, user])
);

const byEmail = new Map(
  authUsers
    .filter((user) => user.email)
    .map((user) => [user.email.toLowerCase(), user])
);

const rows = sellers.map((seller) => {
  const uid = seller.uid || null;

  const email =
    typeof seller.email === 'string'
      ? seller.email.trim().toLowerCase()
      : null;

  const authByUid = uid ? byUid.get(uid) : null;
  const authByEmail = email ? byEmail.get(email) : null;

  return {
    sellerId: seller.id,
    uid,
    email,
    active: seller.active ?? null,
    role: seller.role ?? null,

    authMatchByUid: !!authByUid,

    authMatchByEmail: !!authByEmail,

    authUidByEmail: authByEmail?.uid || null,

    authDisabledByEmail:
      authByEmail?.disabled ?? null,
  };
});

const noUid = rows.filter((row) => !row.uid);

const withoutUidButAuthEmailMatch =
  noUid.filter((row) => row.authMatchByEmail);

const withoutUidNoAuthEmailMatch =
  noUid.filter((row) => !row.authMatchByEmail);

const uidAuthMismatches =
  rows.filter(
    (row) => row.uid && !row.authMatchByUid
  );

const emailAuthUidConflicts =
  rows.filter(
    (row) =>
      row.uid &&
      row.authMatchByEmail &&
      row.authUidByEmail !== row.uid
  );

const result = {
  audit: 'S6-D1-D2',
  mode: 'READ_ONLY',
  projectId: PROJECT,

  sellersDocuments: sellers.length,

  authUsers: authUsers.length,

  sellersWithUid:
    rows.filter((row) => row.uid).length,

  sellersWithoutUid:
    noUid.length,

  withoutUidButAuthEmailMatch:
    withoutUidButAuthEmailMatch.length,

  withoutUidNoAuthEmailMatch:
    withoutUidNoAuthEmailMatch.length,

  uidAuthMismatches:
    uidAuthMismatches.length,

  emailAuthUidConflicts:
    emailAuthUidConflicts.length,

  accounts: rows,

  result: 'REVIEW_REQUIRED',
};

fs.mkdirSync('artifacts', { recursive: true });

fs.writeFileSync(
  'artifacts/s6d1-d2-legacy-login-account-verification.json',
  JSON.stringify(result, null, 2)
);

console.log('==================================================');
console.log('S6-D1-D2 LEGACY LOGIN ACCOUNT VERIFICATION');
console.log('==================================================');

for (const [key, value] of Object.entries(result)) {
  if (key !== 'accounts') {
    console.log(
      key.toUpperCase() +
        '=' +
        JSON.stringify(value)
    );
  }
}

console.log('[SELLER ACCOUNT MAP]');

console.log(
  JSON.stringify(rows, null, 2)
);

console.log('==================================================');