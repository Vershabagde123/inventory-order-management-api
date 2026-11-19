// Role/permission mapping for the UI.
//
// API permissions mirror the backend authorization in src/modules/*/*.routes.ts
// (authorize('ADMIN') / authorize('ADMIN', 'STAFF')). The backend remains the
// final authority; this only decides what each role is shown.

export const ROLES = ['ADMIN', 'STAFF'];

/** Actions -> roles allowed, matching the backend routes. */
const PERMISSIONS = {
  'products.view': ['ADMIN', 'STAFF'], // GET /products, GET /products/:id
  'products.manage': ['ADMIN'], // POST /products, PUT /products/:id, DELETE /products/:id
  'inventory.update': ['ADMIN'], // stock changes go through PUT /products/:id
  'orders.view': ['ADMIN', 'STAFF'], // GET /orders, GET /orders/:id
  'orders.create': ['ADMIN', 'STAFF'], // POST /orders
  'reports.view': ['ADMIN', 'STAFF'], // GET /reports/low-stock
  // POST /auth/register is a public endpoint that always creates STAFF users;
  // in this dashboard, staff management is offered to administrators only.
  'staff.manage': ['ADMIN'],
};

export function can(role, permission) {
  return Boolean(role && PERMISSIONS[permission]?.includes(role));
}

/** Pages of each dashboard: one list drives both the sidebar and route protection. */
const PAGES = [
  { path: '/', label: 'Dashboard', roles: ['ADMIN', 'STAFF'] },
  { path: '/products', label: 'Products', roles: ['ADMIN', 'STAFF'] },
  { path: '/inventory', label: 'Inventory', roles: ['ADMIN'] },
  { path: '/staff', label: 'Staff Management', roles: ['ADMIN'] },
  { path: '/orders', label: 'Orders', roles: ['ADMIN', 'STAFF'] },
  { path: '/reports', label: 'Reports', roles: ['ADMIN'] },
];

export function navFor(role) {
  return PAGES.filter((p) => p.roles.includes(role));
}

/** Can `role` open `pathname`? Sub-paths inherit their section (e.g. /orders/12 -> /orders). */
export function canOpen(role, pathname) {
  const section = '/' + (pathname.split('/')[1] ?? '');
  const page = PAGES.find((p) => p.path === section);
  return Boolean(page && page.roles.includes(role));
}

export const ROLE_TITLES = { ADMIN: 'Admin Dashboard', STAFF: 'Staff Dashboard' };
