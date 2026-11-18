/**
 * Generates postman/Inventory-Order-Management-API.postman_collection.json
 *   node scripts/build-postman.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';

const json = (obj) => JSON.stringify(obj, null, 2);
const noauth = { type: 'noauth' };

function req(name, method, path, { body, auth, tests, description, query } = {}) {
  const segments = path.replace(/^\//, '').split('/');
  const request = {
    method,
    header: body ? [{ key: 'Content-Type', value: 'application/json' }] : [],
    url: {
      raw: `{{baseUrl}}${path}${query ? '?' + query.map((q) => `${q.key}=${q.value}`).join('&') : ''}`,
      host: ['{{baseUrl}}'],
      path: segments,
      ...(query ? { query } : {}),
    },
    ...(description ? { description } : {}),
  };
  if (body) request.body = { mode: 'raw', raw: json(body), options: { raw: { language: 'json' } } };
  if (auth) request.auth = auth;
  const item = { name, request, response: [] };
  if (tests) item.event = [{ listen: 'test', script: { type: 'text/javascript', exec: tests } }];
  return item;
}

const bearer = (variable) => ({
  type: 'bearer',
  bearer: [{ key: 'token', value: `{{${variable}}}`, type: 'string' }],
});

const collection = {
  info: {
    name: 'Inventory & Order Management API',
    description:
      'Import this collection, select/create an environment with `baseUrl` (default http://localhost:5000), run "Login (Admin)" first - the token is stored automatically. Requests use Bearer {{token}} unless noted.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  auth: bearer('token'),
  variable: [
    { key: 'baseUrl', value: 'http://localhost:5000' },
    { key: 'adminEmail', value: 'admin@example.com' },
    { key: 'adminPassword', value: 'CHANGE_ME' },
    { key: 'token', value: '' },
    { key: 'adminToken', value: '' },
    { key: 'staffToken', value: '' },
    { key: 'productId', value: '1' },
    { key: 'orderId', value: '1' },
  ],
  item: [
    {
      name: 'Health',
      item: [req('Health check', 'GET', '/health', { auth: noauth })],
    },
    {
      name: 'Auth',
      item: [
        req('Register (STAFF)', 'POST', '/auth/register', {
          auth: noauth,
          body: { name: 'Jane Staff', email: 'jane.staff@example.com', password: 'Password123' },
          tests: [
            'pm.test("201 Created", () => pm.response.to.have.status(201));',
            'const data = pm.response.json().data;',
            'if (data && data.token) { pm.collectionVariables.set("staffToken", data.token); }',
          ],
        }),
        req('Login (Admin)', 'POST', '/auth/login', {
          auth: noauth,
          body: { email: '{{adminEmail}}', password: '{{adminPassword}}' },
          tests: [
            'pm.test("200 OK", () => pm.response.to.have.status(200));',
            'const data = pm.response.json().data;',
            'pm.collectionVariables.set("adminToken", data.token);',
            'pm.collectionVariables.set("token", data.token);',
          ],
        }),
        req('Login (Staff)', 'POST', '/auth/login', {
          auth: noauth,
          body: { email: 'jane.staff@example.com', password: 'Password123' },
          tests: [
            'pm.test("200 OK", () => pm.response.to.have.status(200));',
            'const data = pm.response.json().data;',
            'pm.collectionVariables.set("staffToken", data.token);',
          ],
        }),
        req('Current user', 'GET', '/users/me'),
      ],
    },
    {
      name: 'Products',
      item: [
        req('Create product (ADMIN)', 'POST', '/products', {
          auth: bearer('adminToken'),
          body: { name: 'Laptop', sku: 'LAP-{{$timestamp}}', price: 50000, stock: 10 },
          tests: [
            'pm.test("201 Created", () => pm.response.to.have.status(201));',
            'pm.collectionVariables.set("productId", pm.response.json().data.id);',
          ],
        }),
        req('Get products (paginated + search)', 'GET', '/products', {
          query: [
            { key: 'page', value: '1' },
            { key: 'limit', value: '10' },
            { key: 'search', value: 'laptop' },
          ],
        }),
        req('Get product by ID', 'GET', '/products/{{productId}}'),
        req('Update product (ADMIN)', 'PUT', '/products/{{productId}}', {
          auth: bearer('adminToken'),
          body: { name: 'Laptop Pro', price: 55000, stock: 15 },
        }),
        req('Create product as STAFF (expect 403)', 'POST', '/products', {
          auth: bearer('staffToken'),
          body: { name: 'Forbidden', sku: 'NOPE-001', price: 1, stock: 1 },
          tests: ['pm.test("403 Forbidden", () => pm.response.to.have.status(403));'],
        }),
        req('Delete product (ADMIN)', 'DELETE', '/products/{{productId}}', {
          auth: bearer('adminToken'),
          description: 'Returns 204. Returns 409 if the product appears in any order.',
        }),
      ],
    },
    {
      name: 'Orders',
      item: [
        req('Create order', 'POST', '/orders', {
          body: {
            items: [
              { productId: 1, quantity: 2 },
              { productId: 2, quantity: 1 },
            ],
          },
          tests: [
            'pm.test("201 Created", () => pm.response.to.have.status(201));',
            'pm.collectionVariables.set("orderId", pm.response.json().data.id);',
          ],
        }),
        req('Create order - insufficient stock (expect 409)', 'POST', '/orders', {
          body: { items: [{ productId: 1, quantity: 100000 }] },
        }),
        req('Get order by ID', 'GET', '/orders/{{orderId}}'),
        req('List orders', 'GET', '/orders', {
          query: [
            { key: 'page', value: '1' },
            { key: 'limit', value: '10' },
          ],
        }),
      ],
    },
    {
      name: 'Reports',
      item: [
        req('Low-stock report', 'GET', '/reports/low-stock', {
          query: [{ key: 'threshold', value: '10' }],
        }),
      ],
    },
  ],
};

mkdirSync('postman', { recursive: true });
writeFileSync(
  'postman/Inventory-Order-Management-API.postman_collection.json',
  json(collection) + '\n',
);
console.log('Postman collection written.');
