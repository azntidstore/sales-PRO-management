import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { assertOrderBasics, normalizeItems, buildTrustedItems, calculateTrustedFinancials } from './orderCore.js';
import { cleanId, assertOpenSessionShape } from './sessionCore.js';

const PROJECT_ID = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
const CLIENT_EMAIL = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const PRIVATE_KEY = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
const USE_EMULATORS = Boolean(process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);

if (!USE_EMULATORS && (!PROJECT_ID || !CLIENT_EMAIL || !PRIVATE_KEY)) {
  console.error('[orders-api] Firebase Admin environment is incomplete');
}

const adminApp = getApps().length
  ? getApps()[0]
  : USE_EMULATORS
    ? initializeApp({ projectId: PROJECT_ID || 'seller-pro-management' })
    : initializeApp({
        credential: cert({ projectId: PROJECT_ID, clientEmail: CLIENT_EMAIL, privateKey: PRIVATE_KEY }),
        projectId: PROJECT_ID,
      });
const db = getFirestore(adminApp);
const adminAuth = getAuth(adminApp);

function json(res, status, payload) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(payload));
}

function getBearer(req) {
  const value = req.headers.authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

async function authenticate(req) {
  const token = getBearer(req);
  if (!token) throw Object.assign(new Error('AUTH_REQUIRED'), { status: 401 });
  const decoded = await adminAuth.verifyIdToken(token);
  const uid = decoded.uid;
  const profileSnap = await db.doc(`users/${uid}`).get();
  if (!profileSnap.exists || profileSnap.data()?.uid !== uid || profileSnap.data()?.active !== true) {
    throw Object.assign(new Error('AUTH_PROFILE_INVALID'), { status: 403 });
  }

  const profile = profileSnap.data();
  const roles = Array.from(new Set([
    profile.role,
    ...(Array.isArray(profile.roles) ? profile.roles : [])
  ].filter(Boolean)));

  if (!roles.length) {
    throw Object.assign(new Error('AUTH_PROFILE_INVALID'), { status: 403 });
  }

  const requiresSellerProfile =
    roles.includes('SELLER') || roles.includes('SUPERVISOR');

  let seller = null;

  if (requiresSellerProfile) {
    const sellerId = profile.sellerId;
    if (!sellerId) {
      throw Object.assign(new Error('AUTH_PROFILE_INVALID'), { status: 403 });
    }

    const sellerSnap = await db.doc(`sellers/${sellerId}`).get();
    if (!sellerSnap.exists || sellerSnap.data()?.active !== true) {
      throw Object.assign(new Error('AUTH_PROFILE_INVALID'), { status: 403 });
    }

    seller = sellerSnap.data();
  }

  return { uid, profile, seller, roles };
}

function canManageOrders(ctx) {
  return ctx.roles.includes('ADMIN') || ctx.roles.includes('DEPUTY') || ctx.roles.includes('SUPERVISOR');
}

async function resolveSeller(ctx, sellerId) {
  const targetId = sellerId || ctx.profile.sellerId;
  if (!targetId) throw Object.assign(new Error('SELLER_REQUIRED'), { status: 400 });
  if (ctx.roles.includes('SELLER') && !canManageOrders(ctx) && targetId !== ctx.profile.sellerId) {
    throw Object.assign(new Error('SELLER_SCOPE_DENIED'), { status: 403 });
  }
  const snap = await db.doc(`sellers/${targetId}`).get();
  if (!snap.exists || snap.data()?.active !== true) throw Object.assign(new Error('SELLER_NOT_FOUND'), { status: 400 });
  const seller = snap.data();
  if (ctx.roles.includes('SUPERVISOR') && !ctx.roles.includes('ADMIN') && !ctx.roles.includes('DEPUTY')) {
    const parents = Array.from(new Set([...(Array.isArray(seller.parentIds) ? seller.parentIds : []), seller.parentId].filter(Boolean)));
    if (!parents.includes(ctx.profile.sellerId) && targetId !== ctx.profile.sellerId) {
      throw Object.assign(new Error('SUPERVISOR_SCOPE_DENIED'), { status: 403 });
    }
  }
  return { id: targetId, seller };
}

function validateSupervisorAssignment(seller, assignedSupervisorId) {
  const parents = Array.from(new Set([...(Array.isArray(seller.parentIds) ? seller.parentIds : []), seller.parentId].filter(Boolean)));
  if (parents.length === 0) return assignedSupervisorId || null;
  if (parents.length === 1) {
    if (assignedSupervisorId && assignedSupervisorId !== parents[0]) throw Object.assign(new Error('INVALID_SUPERVISOR_ASSIGNMENT'), { status: 400 });
    return parents[0];
  }
  if (!assignedSupervisorId || !parents.includes(assignedSupervisorId)) throw Object.assign(new Error('SUPERVISOR_REQUIRED'), { status: 400 });
  return assignedSupervisorId;
}

function sanitizeId(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error('INVALID_ORDER_ID');
  return id;
}

async function resolveOpenSessionForSeller(sellerId) {
  const snap = await db.collection('settlementSessions')
    .where('sellerId', '==', sellerId)
    .where('status', '==', 'OPEN')
    .limit(2)
    .get();
  if (snap.empty) throw Object.assign(new Error('NO_OPEN_SESSION'), { status: 409 });
  if (snap.size > 1) throw Object.assign(new Error('MULTIPLE_OPEN_SESSIONS'), { status: 409 });
  const doc = snap.docs[0];
  assertOpenSessionShape(doc.data());
  return { id: doc.id, data: doc.data() };
}

async function assertOrderSessionMutable(tx, old) {
  if (!old.sessionId) return null;
  const sessionRef = db.doc(`settlementSessions/${cleanId(old.sessionId)}`);
  const sessionSnap = await tx.get(sessionRef);
  if (!sessionSnap.exists) throw Object.assign(new Error('SESSION_NOT_FOUND'), { status: 409 });
  const session = sessionSnap.data();
  if (session.status !== 'OPEN') throw Object.assign(new Error('ORDER_SESSION_CLOSED'), { status: 409 });
  if (session.sellerId !== old.sellerId) throw Object.assign(new Error('ORDER_SESSION_SELLER_MISMATCH'), { status: 409 });
  return session;
}

async function createOrder(ctx, body) {
  const basics = assertOrderBasics(body);
  const requestItems = normalizeItems(body.items);
  const { id: sellerId, seller } = await resolveSeller(ctx, body.sellerId);
  const assignedSupervisorId = validateSupervisorAssignment(seller, body.assignedSupervisorId);
  const session = await resolveOpenSessionForSeller(sellerId);
  if (ctx.roles.includes('SELLER') && !canManageOrders(ctx) && body.orderStatus !== 'PENDING') {
    throw Object.assign(new Error('SELLER_CREATE_STATUS_DENIED'), { status: 403 });
  }

  const productRefs = requestItems.map((item) => db.doc(`products/${item.productId}`));
  const orderRef = db.collection('orders').doc();
  const result = await db.runTransaction(async (tx) => {
    const productSnaps = await tx.getAll(...productRefs);
    const productMap = new Map(productSnaps.map((snap) => [snap.id, snap.exists ? snap.data() : null]));
    const items = buildTrustedItems(requestItems, productMap);
    const financials = calculateTrustedFinancials(items, basics.deliveryCost, basics.orderStatus);
    const now = new Date().toISOString();
    const first = items[0];
    const order = {
      id: orderRef.id,
      orderDate: basics.orderDate,
      sellerName: seller.name,
      sellerNameSnapshot: seller.name,
      customerName: basics.customerName,
      phone: basics.phone,
      city: basics.city,
      address: basics.address,
      quantity: first.quantity,
      product: first.productNameSnapshot,
      productId: first.productId,
      productNameSnapshot: first.productNameSnapshot,
      wholesalePriceSnapshot: first.wholesalePriceSnapshot,
      sellingPriceSnapshot: first.sellingPriceSnapshot,
      items,
      productIds: items.map((item) => item.productId),
      deliveryCost: basics.deliveryCost,
      totalAmount: financials.totalAmount,
      notes: basics.notes,
      orderStatus: basics.orderStatus,
      profit: financials.profit,
      createdBy: ctx.profile.name || seller.name,
      sellerId,
      createdByUid: ctx.uid,
      assignedSupervisorId,
      sessionId: session.id,
      createdAt: now,
      updatedAt: now,
    };
    tx.create(orderRef, order);
    return order;
  });
  return result;
}

function allowedUpdateKeys(body) {
  const allowed = new Set([
    'orderDate', 'customerName', 'phone', 'city', 'address', 'quantity', 'product',
    'deliveryCost', 'notes', 'orderStatus', 'items', 'productIds', 'sellerId',
    'sellerName', 'assignedSupervisorId', 'updatedAt'
  ]);
  for (const key of Object.keys(body)) if (!allowed.has(key)) throw Object.assign(new Error(`FIELD_NOT_ALLOWED:${key}`), { status: 400 });
}

async function updateOrder(ctx, body) {
  const id = sanitizeId(body.id);
  const ref = db.doc(`orders/${id}`);
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw Object.assign(new Error('ORDER_NOT_FOUND'), { status: 404 });
    const old = snap.data();
    await assertOrderSessionMutable(tx, old);
    const owner = old.sellerId ? await db.doc(`sellers/${old.sellerId}`).get() : null;
    const ownerData = owner?.exists ? owner.data() : null;
    const isAdminOrDeputy = ctx.roles.includes('ADMIN') || ctx.roles.includes('DEPUTY');
    const isSupervisor = ctx.roles.includes('SUPERVISOR');
    if (ctx.roles.includes('SELLER') && !isAdminOrDeputy && !isSupervisor) throw Object.assign(new Error('SELLER_UPDATE_DENIED'), { status: 403 });
    if (isSupervisor && !isAdminOrDeputy) {
      const scope = ownerData && Array.from(new Set([...(Array.isArray(ownerData.parentIds) ? ownerData.parentIds : []), ownerData.parentId].filter(Boolean)));
      if (!scope?.includes(ctx.profile.sellerId) && old.sellerId !== ctx.profile.sellerId) throw Object.assign(new Error('SUPERVISOR_SCOPE_DENIED'), { status: 403 });
    }
    if (ctx.roles.includes('SELLER') && !isAdminOrDeputy && !isSupervisor) throw Object.assign(new Error('SELLER_UPDATE_DENIED'), { status: 403 });
    if (typeof body.expectedUpdatedAt !== 'string' || old.updatedAt !== body.expectedUpdatedAt) throw Object.assign(new Error('ORDER_CONCURRENCY_CONFLICT'), { status: 409 });
    const updatePayload = { ...body };
    delete updatePayload.id;
    delete updatePayload.expectedUpdatedAt;
    allowedUpdateKeys(updatePayload);
    if (body.sessionId !== undefined && body.sessionId !== old.sessionId) throw Object.assign(new Error('ORDER_SESSION_IMMUTABLE'), { status: 400 });

    const isModern = Array.isArray(old.items) && old.items.length > 0;
    const nextStatus = body.orderStatus === undefined ? old.orderStatus : body.orderStatus;
    if (!['PENDING', 'DELIVERED', 'DELAYED', 'REJECTED'].includes(nextStatus)) {
      throw Object.assign(new Error('INVALID_ORDER_STATUS'), { status: 400 });
    }
    const nextDelivery = body.deliveryCost === undefined ? old.deliveryCost : body.deliveryCost;
    if (typeof nextDelivery !== 'number' || !Number.isFinite(nextDelivery) || nextDelivery < 0 || nextDelivery > 1_000_000_000) {
      throw Object.assign(new Error('INVALID_DELIVERY_COST'), { status: 400 });
    }
    const patch = {};

    for (const key of ['orderDate', 'customerName', 'phone', 'city', 'address', 'notes']) {
      if (body[key] !== undefined) patch[key] = typeof body[key] === 'string' ? body[key].trim() : body[key];
    }
    if (body.assignedSupervisorId !== undefined || body.sellerId !== undefined) {
      const targetSellerId = body.sellerId || old.sellerId;
      const sellerSnap = await db.doc(`sellers/${targetSellerId}`).get();
      if (!sellerSnap.exists) throw Object.assign(new Error('SELLER_NOT_FOUND'), { status: 400 });
      patch.sellerId = targetSellerId;
      patch.sellerName = sellerSnap.data().name;
      patch.sellerNameSnapshot = old.sellerNameSnapshot || sellerSnap.data().name;
      patch.assignedSupervisorId = validateSupervisorAssignment(sellerSnap.data(), body.assignedSupervisorId || old.assignedSupervisorId);
    }

    if (isModern) {
      const rawItems = body.items === undefined ? old.items.map((item) => ({ productId: item.productId, quantity: item.quantity })) : body.items;
      const requestItems = normalizeItems(rawItems);
      if (requestItems.length !== old.items.length || requestItems.some((item, i) => item.productId !== old.items[i].productId)) {
        throw Object.assign(new Error('ORDER_PRODUCT_SET_IMMUTABLE'), { status: 400 });
      }
      const productMap = new Map(old.items.map((item) => [item.productId, item]));
      const trustedItems = requestItems.map((item) => ({ ...productMap.get(item.productId), quantity: item.quantity }));
      const deliveryCost = typeof nextDelivery === 'number' ? nextDelivery : Number(nextDelivery);
      const financials = calculateTrustedFinancials(trustedItems, deliveryCost, nextStatus);
      patch.items = trustedItems;
      patch.productIds = trustedItems.map((item) => item.productId);
      patch.quantity = trustedItems[0].quantity;
      patch.product = trustedItems[0].productNameSnapshot;
      patch.productId = trustedItems[0].productId;
      patch.productNameSnapshot = trustedItems[0].productNameSnapshot;
      patch.wholesalePriceSnapshot = trustedItems[0].wholesalePriceSnapshot;
      patch.sellingPriceSnapshot = trustedItems[0].sellingPriceSnapshot;
      patch.deliveryCost = deliveryCost;
      patch.totalAmount = financials.totalAmount;
      patch.profit = financials.profit;
      patch.orderStatus = nextStatus;
    } else {
      if (body.deliveryCost !== undefined) patch.deliveryCost = Number(body.deliveryCost);
      if (body.orderStatus !== undefined) patch.orderStatus = nextStatus;
      // Legacy financial history is never re-priced from today's product catalog.
      patch.totalAmount = old.totalAmount;
      patch.profit = old.profit;
    }

    if (body.updatedAt && body.updatedAt !== body.expectedUpdatedAt) throw Object.assign(new Error('INVALID_VERSION'), { status: 400 });
    patch.updatedAt = new Date().toISOString();
    tx.update(ref, patch);
    return { ...old, ...patch, id };
  });
  return result;
}

async function deleteOrder(ctx, body) {
  const id = sanitizeId(body.id);
  if (!(ctx.roles.includes('ADMIN') || ctx.roles.includes('DEPUTY') || ctx.roles.includes('SUPERVISOR'))) throw Object.assign(new Error('DELETE_DENIED'), { status: 403 });
  const ref = db.doc(`orders/${id}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw Object.assign(new Error('ORDER_NOT_FOUND'), { status: 404 });
    const old = snap.data();
    if (ctx.roles.includes('SUPERVISOR') && !ctx.roles.includes('ADMIN') && !ctx.roles.includes('DEPUTY')) {
      const sellerSnap = old.sellerId ? await db.doc(`sellers/${old.sellerId}`).get() : null;
      const seller = sellerSnap?.exists ? sellerSnap.data() : null;
      const parents = Array.from(new Set([...(Array.isArray(seller?.parentIds) ? seller.parentIds : []), seller?.parentId].filter(Boolean)));
      if (!parents.includes(ctx.profile.sellerId) && old.sellerId !== ctx.profile.sellerId) throw Object.assign(new Error('SUPERVISOR_SCOPE_DENIED'), { status: 403 });
    }
    tx.delete(ref);
  });
  return { id, deleted: true };
}

export default async function handler(req, res) {
  try {
    if (!['POST', 'PATCH', 'DELETE'].includes(req.method)) return json(res, 405, { error: 'METHOD_NOT_ALLOWED' });
    const ctx = await authenticate(req);
    const body = typeof req.body === 'object' && req.body ? req.body : {};
    const result = req.method === 'POST' ? await createOrder(ctx, body) : req.method === 'PATCH' ? await updateOrder(ctx, body) : await deleteOrder(ctx, body);
    return json(res, 200, { ok: true, order: result });
  } catch (err) {
    console.error('[orders-api]', err);
    const status = Number.isInteger(err?.status) ? err.status : (err?.code === 'auth/id-token-expired' || err?.code === 'auth/argument-error' ? 401 : 400);
    return json(res, status, { ok: false, error: err?.message || 'ORDER_OPERATION_FAILED' });
  }
}
