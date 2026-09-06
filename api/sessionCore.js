export const SESSION_STATUSES = Object.freeze(['OPEN', 'CLOSED']);
export const MONEY_MAX = 1_000_000_000_000;

export function cleanId(value, code = 'INVALID_SESSION_ID') {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw Object.assign(new Error(code), { status: 400 });
  }
  return value;
}

export function cleanSellerId(value) {
  return cleanId(value, 'INVALID_SELLER_ID');
}

export function assertOpenSessionShape(data) {
  if (!data || data.status !== 'OPEN') throw Object.assign(new Error('SESSION_NOT_OPEN'), { status: 409 });
  if (typeof data.sellerId !== 'string' || !data.sellerId) throw Object.assign(new Error('SESSION_SELLER_REQUIRED'), { status: 500 });
  if (typeof data.openedAt !== 'string' || !data.openedAt) throw Object.assign(new Error('SESSION_OPENED_AT_INVALID'), { status: 500 });
  if (typeof data.openedByUid !== 'string' || !data.openedByUid) throw Object.assign(new Error('SESSION_OPENED_BY_INVALID'), { status: 500 });
}

export function assertSessionAggregates(data) {
  for (const key of ['orderCount', 'totalSales', 'totalProfit']) {
    if (!Number.isFinite(Number(data[key])) || Number(data[key]) < 0) {
      throw Object.assign(new Error(`INVALID_SESSION_AGGREGATE:${key}`), { status: 400 });
    }
  }
  if (Number(data.orderCount) > 10_000_000) throw Object.assign(new Error('SESSION_ORDER_COUNT_TOO_LARGE'), { status: 400 });
  if (Number(data.totalSales) > MONEY_MAX || Number(data.totalProfit) > MONEY_MAX) {
    throw Object.assign(new Error('SESSION_AGGREGATE_TOO_LARGE'), { status: 400 });
  }
}

/**
 * Server-side canonical aggregate calculation. The caller supplies already-authorized
 * order rows; this helper never trusts client totals and ignores non-delivered profit.
 */
export function calculateSessionAggregates(orders) {
  if (!Array.isArray(orders)) throw new Error('SESSION_ORDERS_MUST_BE_ARRAY');
  let totalSales = 0;
  let deliveredSales = 0;
  let totalProfit = 0;
  let deliveredOrderCount = 0;
  for (const order of orders) {
    const total = Number(order?.totalAmount || 0);
    if (!Number.isFinite(total) || total < 0) throw new Error('INVALID_ORDER_TOTAL_FOR_SESSION');
    totalSales += total;
    if (order?.orderStatus === 'DELIVERED') {
      deliveredOrderCount += 1;
      deliveredSales += total;
      const profit = Number(order?.profit || 0);
      if (!Number.isFinite(profit)) throw new Error('INVALID_ORDER_PROFIT_FOR_SESSION');
      totalProfit += profit;
    }
  }
  return {
    orderCount: orders.length,
    deliveredOrderCount,
    totalSales,
    deliveredSales,
    totalProfit,
    settlementAmount: deliveredSales,
  };
}

export function buildSettlementInvoice(sessionId, sellerId, aggregates, generatedAt) {
  if (!sessionId || !sellerId || !aggregates || !generatedAt) throw new Error('INVALID_SETTLEMENT_INVOICE_INPUT');
  return {
    sessionId,
    sellerId,
    generatedAt,
    orderCount: Number(aggregates.orderCount),
    deliveredOrderCount: Number(aggregates.deliveredOrderCount),
    totalSales: Number(aggregates.totalSales),
    deliveredSales: Number(aggregates.deliveredSales),
    totalProfit: Number(aggregates.totalProfit),
    settlementAmount: Number(aggregates.settlementAmount),
  };
}
