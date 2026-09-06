import { auth } from '../firebase';
import { Order } from '../types';

const apiBase = (import.meta.env.VITE_TRUSTED_ORDER_API_URL || '').replace(/\/$/, '');
const endpoint = `${apiBase}/api/orders`;

async function callTrustedOrderApi(body: unknown): Promise<Order> {
  const user = auth?.currentUser;
  if (!user) throw new Error('ORDER_UNAUTHORIZED');
  const token = await user.getIdToken();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok !== true) {
    const error = new Error(data?.error || `ORDER_API_HTTP_${response.status}`);
    throw error;
  }
  return data.order as Order;
}

export async function createTrustedOrder(order: Order): Promise<Order> {
  return callTrustedOrderApi({ action: 'create', order });
}

export async function updateTrustedOrder(id: string, patch: Partial<Order>, expectedUpdatedAt: string): Promise<Order> {
  return callTrustedOrderApi({ action: 'update', id, patch, expectedUpdatedAt });
}
