import assert from 'node:assert/strict';
import http from 'node:http';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

process.env.GCLOUD_PROJECT ||= 'seller-pro-management';
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';

const adminApp = getApps().length
  ? getApps()[0]
  : initializeApp({ projectId: process.env.GCLOUD_PROJECT });

const adminAuth = getAdminAuth(adminApp);
const db = getFirestore(adminApp);

const { default: handler } = await import('../api/orders.js');
const { default: sessionHandler } = await import('../api/sessions.js');

const server = http.createServer(async (req, res) => {
  // Minimal Vercel-compatible adapter for the local Node test server.
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };

  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));

  const rawBody = Buffer.concat(chunks).toString('utf8');
  req.body = rawBody ? JSON.parse(rawBody) : {};

  await handler(req, res);
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

async function tokenFor(email) {
  const password = 'Integration-Test-Only-9x!';
  const authBase =
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';

  // Create the test account directly in the Auth Emulator.
  // This avoids mixing Admin SDK account creation with a separate
  // authentication path and guarantees both operations use the
  // same emulator instance.
  const createResponse = await fetch(
    `${authBase}/accounts:signUp?key=test-api-key`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true
      })
    }
  );

  if (!createResponse.ok) {
    const errorText = await createResponse.text();
    throw new Error(
      `Auth emulator account creation failed (${createResponse.status}): ${errorText}`
    );
  }

  const created = await createResponse.json();

  if (!created.localId) {
    throw new Error(
      'Auth emulator account creation returned no localId'
    );
  }

  // Sign in through the same Auth Emulator and obtain a real ID token.
  const signInResponse = await fetch(
    `${authBase}/accounts:signInWithPassword?key=test-api-key`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true
      })
    }
  );

  if (!signInResponse.ok) {
    const errorText = await signInResponse.text();
    throw new Error(
      `Auth emulator sign-in failed (${signInResponse.status}): ${errorText}`
    );
  }

  const body = await signInResponse.json();

  return {
    uid: created.localId,
    token: body.idToken
  };
}

async function request(method, token, body) {
  const response = await fetch(`${base}/api/orders`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  });

  const payload = await response.json();

  return {
    response,
    payload
  };
}

async function sessionRequest(method, token, body) {
  const sessionServer = http.createServer(async (req, res) => {
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };

    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));

    const rawBody = Buffer.concat(chunks).toString('utf8');
    req.body = rawBody ? JSON.parse(rawBody) : {};

    await sessionHandler(req, res);
  });

  await new Promise(resolve =>
    sessionServer.listen(0, '127.0.0.1', resolve)
  );

  const sessionPort = sessionServer.address().port;

  try {
    const response = await fetch(
      `http://127.0.0.1:${sessionPort}/api/sessions`,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body)
      }
    );

    const payload = await response.json();

    return {
      response,
      payload
    };
  } finally {
    sessionServer.close();
  }
}

try {
  // ------------------------------------------------------------
  // 1. Create authenticated test users
  // ------------------------------------------------------------
  const seller = await tokenFor('e3f-seller@example.test');
  const admin = await tokenFor('e3f-admin@example.test');

  // ------------------------------------------------------------
  // 2. Create seller and user profiles
  // ------------------------------------------------------------
  await db.doc('sellers/seller-e3f').set({
    id: 'seller-e3f',
    name: 'Integration Seller',
    active: true
  });

  await db.doc(`users/${seller.uid}`).set({
    uid: seller.uid,
    role: 'SELLER',
    roles: ['SELLER'],
    active: true,
    sellerId: 'seller-e3f',
    name: 'Integration Seller'
  });

  await db.doc(`users/${admin.uid}`).set({
    uid: admin.uid,
    role: 'ADMIN',
    roles: ['ADMIN'],
    active: true,
    name: 'Integration Admin'
  });

  // ------------------------------------------------------------
  // 3. Open settlement session through the trusted Session API
  // ------------------------------------------------------------
  const opened = await sessionRequest(
    'POST',
    admin.token,
    {
      sellerId: 'seller-e3f'
    }
  );

  assert.equal(
    opened.response.status,
    200,
    JSON.stringify(opened.payload)
  );

  const openedSession = opened.payload.session;

  assert.equal(openedSession.status, 'OPEN');
  assert.equal(openedSession.sellerId, 'seller-e3f');

  // ------------------------------------------------------------
  // 4. Create 50 active products
  // ------------------------------------------------------------
  const productRefs = [];

  for (let i = 1; i <= 50; i++) {
    const id = `e3f-product-${i}`;

    productRefs.push(id);

    await db.doc(`products/${id}`).set({
      id,
      active: true,
      productName: `Product ${i}`,
      sellingPrice: 20 + i,
      wholesalePrice: 10 + i
    });
  }

  // ------------------------------------------------------------
  // 5. SELLER creates a 50-item order
  // ------------------------------------------------------------
  const items = productRefs.map(productId => ({
    productId,
    quantity: 2
  }));

  const created = await request(
    'POST',
    seller.token,
    {
      sellerId: 'seller-e3f',
      customerName: 'Integration Customer',
      phone: '0600000000',
      city: 'Test',
      address: 'Test Address',
      deliveryCost: 35,
      orderStatus: 'PENDING',
      items,

      // Deliberately malicious client values.
      // Server must ignore them and calculate canonical values.
      totalAmount: 1,
      profit: 999999,

      notes: 'integration'
    }
  );

  assert.equal(
    created.response.status,
    200,
    JSON.stringify(created.payload)
  );

  const order = created.payload.order;

  assert.equal(order.items.length, 50);
  assert.equal(order.totalAmount, 4585);
  assert.equal(order.orderStatus, 'PENDING');
  assert.equal(order.profit, 0);

  assert.equal(
    order.totalAmount,
    order.items.reduce(
      (sum, item) =>
        sum + item.sellingPriceSnapshot * item.quantity,
      35
    )
  );

  // Order must be bound to the currently open session.
  assert.equal(order.sessionId, openedSession.sessionId);

  // ------------------------------------------------------------
  // 6. ADMIN delivers the order
  // ------------------------------------------------------------
  const delivered = await request(
    'PATCH',
    admin.token,
    {
      id: order.id,
      expectedUpdatedAt: order.updatedAt,
      orderStatus: 'DELIVERED'
    }
  );

  assert.equal(
    delivered.response.status,
    200,
    JSON.stringify(delivered.payload)
  );

  const deliveredOrder = delivered.payload.order;

  assert.equal(deliveredOrder.orderStatus, 'DELIVERED');
  assert.equal(deliveredOrder.totalAmount, 4585);
  assert.equal(deliveredOrder.profit, 1000);

  assert.equal(
    deliveredOrder.profit,
    deliveredOrder.items.reduce(
      (sum, item) =>
        sum +
        (item.sellingPriceSnapshot -
          item.wholesalePriceSnapshot) *
          item.quantity,
      0
    )
  );

  // ------------------------------------------------------------
  // 7. Verify immutable trusted product snapshots
  // ------------------------------------------------------------
  assert.equal(
    deliveredOrder.items[0].sellingPriceSnapshot,
    21
  );

  assert.equal(
    deliveredOrder.items[0].wholesalePriceSnapshot,
    11
  );

  // ------------------------------------------------------------
  // 8. SELLER cannot modify the confirmed order
  // ------------------------------------------------------------
  const sellerUpdate = await request(
    'PATCH',
    seller.token,
    {
      id: order.id,
      expectedUpdatedAt: deliveredOrder.updatedAt,
      orderStatus: 'REJECTED'
    }
  );

  assert.equal(sellerUpdate.response.status, 403);

  console.log(
    'E3-F TRUSTED ORDER INTEGRATION: PASS ' +
    '(real Auth emulator token + 50 products + open session + ' +
    'server-trusted snapshots/financials + seller lock)'
  );
} finally {
  server.close();
}