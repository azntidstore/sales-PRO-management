import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const PROJECT_ID = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
const CLIENT_EMAIL = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const PRIVATE_KEY = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
const USE_EMULATORS = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);

if (!USE_EMULATORS && (!PROJECT_ID || !CLIENT_EMAIL || !PRIVATE_KEY)) {
  console.error('[sellers-api] Firebase Admin environment is incomplete');
}

const app = getApps().length
  ? getApps()[0]
  : USE_EMULATORS
    ? initializeApp({ projectId: PROJECT_ID || 'seller-pro-management' })
    : initializeApp({
        credential: cert({
          projectId: PROJECT_ID,
          clientEmail: CLIENT_EMAIL,
          privateKey: PRIVATE_KEY,
        }),
        projectId: PROJECT_ID,
      });

const db = getFirestore(app);
const adminAuth = getAuth(app);

function json(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function bearer(req) {
  const value = req.headers.authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}

async function authenticateAdmin(req) {
  const token = bearer(req);
  if (!token) fail('AUTH_REQUIRED', 401);

  const decoded = await adminAuth.verifyIdToken(token);
  const uid = decoded.uid;
  const profileSnap = await db.doc(`users/${uid}`).get();

  if (
    !profileSnap.exists ||
    profileSnap.data()?.uid !== uid ||
    profileSnap.data()?.active !== true
  ) {
    fail('AUTH_PROFILE_INVALID', 403);
  }

  const profile = profileSnap.data();
  const roles = Array.from(
    new Set([
      profile.role,
      ...(Array.isArray(profile.roles) ? profile.roles : []),
    ].filter(Boolean))
  );

  if (
    !roles.includes('ADMIN') &&
    !roles.includes('DEPUTY') &&
    !roles.includes('SUPERVISOR')
  ) {
    fail('SELLER_PROVISIONING_DENIED', 403);
  }

  return { uid, profile, roles };
}

function canManageTarget(ctx, targetRole, targetParentId, targetParentIds) {
  if (ctx.roles.includes('ADMIN') || ctx.roles.includes('DEPUTY')) {
    return targetRole === 'SELLER';
  }

  if (!ctx.roles.includes('SUPERVISOR')) return false;
  if (targetRole !== 'SELLER') return false;

  const parents = Array.from(new Set([
    ...(Array.isArray(targetParentIds) ? targetParentIds : []),
    targetParentId,
  ].filter(Boolean)));

  return parents.includes(ctx.profile.sellerId);
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function buildSeller(input, existing) {
  const parentIds = Array.isArray(input.parentIds)
    ? input.parentIds.filter(Boolean)
    : (input.parentId ? [input.parentId] : []);

  return {
    ...(existing || {}),
    ...input,
    id: String(input.id || existing?.id || '').trim(),
    name: String(input.name || existing?.name || '').trim(),
    phone: String(input.phone || existing?.phone || '').trim(),
    active: input.active !== false,
    createdAt: input.createdAt || existing?.createdAt || new Date().toISOString(),
    username: normalizeEmail(input.username || input.email || existing?.username || existing?.email),
    email: normalizeEmail(input.email || input.username || existing?.email || existing?.username),
    role: input.role || existing?.role || 'SELLER',
    parentId: input.parentId || existing?.parentId || (parentIds[0] || ''),
    parentIds,
    assignedProducts: Array.isArray(input.assignedProducts)
      ? input.assignedProducts
      : (Array.isArray(existing?.assignedProducts) ? existing.assignedProducts : []),
  };
}

async function findOrCreateAuthUser(email, name, active) {
  try {
    const existing = await adminAuth.getUserByEmail(email);
    return { user: existing, created: false };
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;

    const created = await adminAuth.createUser({
      email,
      displayName: name,
      disabled: active === false,
      emailVerified: false,
    });

    return { user: created, created: true };
  }
}

async function provisionSeller(ctx, body) {
  const input = body?.seller && typeof body.seller === 'object' ? body.seller : {};
  const sellerId = String(input.id || '').trim();
  const email = normalizeEmail(input.email || input.username);
  const role = input.role || 'SELLER';

  if (!sellerId) fail('SELLER_ID_REQUIRED', 400);
  if (!String(input.name || '').trim()) fail('SELLER_NAME_REQUIRED', 400);
  if (!email || !email.includes('@')) fail('SELLER_EMAIL_REQUIRED', 400);
  if (role !== 'SELLER') fail('SELLER_ROLE_INVALID', 400);

  if (!canManageTarget(ctx, role, input.parentId, input.parentIds)) {
    fail('SELLER_SCOPE_DENIED', 403);
  }

  const sellerRef = db.doc(`sellers/${sellerId}`);
  const existingSellerSnap = await sellerRef.get();
  const existingSeller = existingSellerSnap.exists ? existingSellerSnap.data() : null;
  const seller = buildSeller(input, existingSeller);

  if (existingSeller?.uid) {
    const linked = await adminAuth.getUser(existingSeller.uid).catch(() => null);
    if (linked && normalizeEmail(linked.email) === email) {
      return {
        seller: { ...seller, uid: existingSeller.uid },
        uid: existingSeller.uid,
        authCreated: false,
        passwordResetRequired: true,
      };
    }
    fail('SELLER_ALREADY_LINKED', 409);
  }

  const { user, created } = await findOrCreateAuthUser(email, seller.name, seller.active);

  const userRef = db.doc(`users/${user.uid}`);
  const existingProfileSnap = await userRef.get();

  if (existingProfileSnap.exists) {
    const existingProfile = existingProfileSnap.data();
    if (existingProfile.sellerId !== sellerId || existingProfile.uid !== user.uid) {
      if (created) await adminAuth.deleteUser(user.uid).catch(() => {});
      fail('AUTH_PROFILE_ALREADY_LINKED', 409);
    }
  }

  const now = new Date().toISOString();
  const finalSeller = {
    ...seller,
    uid: user.uid,
    updatedAt: now,
  };

  const profile = {
    uid: user.uid,
    sellerId,
    name: seller.name,
    role: 'SELLER',
    roles: ['SELLER'],
    active: seller.active,
    createdAt: existingProfileSnap.exists
      ? (existingProfileSnap.data()?.createdAt || now)
      : now,
    updatedAt: now,
  };

  try {
    await db.runTransaction(async (tx) => {
      tx.set(sellerRef, finalSeller, { merge: true });
      tx.set(userRef, profile, { merge: true });
    });

    await adminAuth.updateUser(user.uid, {
      displayName: seller.name,
      disabled: seller.active === false,
      email,
    });

    return {
      seller: finalSeller,
      uid: user.uid,
      authCreated: created,
      passwordResetRequired: true,
    };
  } catch (error) {
    if (created) {
      await adminAuth.deleteUser(user.uid).catch(() => {});
    }
    throw error;
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return json(res, 405, { ok: false, error: 'METHOD_NOT_ALLOWED' });
    }

    const ctx = await authenticateAdmin(req);
    const body = typeof req.body === 'object' && req.body ? req.body : {};
    const result = await provisionSeller(ctx, body);

    return json(res, 200, {
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error('[sellers-api]', error);
    const status = Number.isInteger(error?.status)
      ? error.status
      : (String(error?.code || '').startsWith('auth/') ? 401 : 400);

    return json(res, status, {
      ok: false,
      error: error?.message || 'SELLER_PROVISIONING_FAILED',
    });
  }
}
