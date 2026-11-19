// One function per existing backend endpoint. Payloads and responses follow
// the backend contract exactly; no business logic lives here.
import { request } from './client.js';

export const api = {
  health: () => request('/health', { auth: false }),

  // Auth
  login: (email, password) =>
    request('/auth/login', { method: 'POST', body: { email, password }, auth: false }),
  /** Public registration - the backend always creates a STAFF user. */
  registerStaff: ({ name, email, password }) =>
    request('/auth/register', { method: 'POST', body: { name, email, password }, auth: false }),
  me: () => request('/users/me'),

  // Products
  listProducts: ({ page = 1, limit = 10, search } = {}) =>
    request('/products', { query: { page, limit, search } }),
  getProduct: (id) => request(`/products/${encodeURIComponent(id)}`),
  createProduct: (product) => request('/products', { method: 'POST', body: product }),
  updateProduct: (id, fields) =>
    request(`/products/${encodeURIComponent(id)}`, { method: 'PUT', body: fields }),
  deleteProduct: (id) => request(`/products/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  // Orders
  listOrders: ({ page = 1, limit = 10 } = {}) => request('/orders', { query: { page, limit } }),
  getOrder: (id) => request(`/orders/${encodeURIComponent(id)}`),
  /** items: [{ productId: number, quantity: number }] */
  createOrder: (items) => request('/orders', { method: 'POST', body: { items } }),

  // Reports
  lowStock: (threshold) => request('/reports/low-stock', { query: { threshold } }),
};

/** Fetch every product page (the API caps `limit` at 100). */
export async function fetchAllProducts() {
  const all = [];
  let page = 1;
  for (;;) {
    const res = await api.listProducts({ page, limit: 100 });
    all.push(...res.data);
    if (!res.pagination.hasNextPage) return all;
    page += 1;
  }
}
