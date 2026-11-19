# Inventory & Orders – Admin Frontend

A lightweight React (Vite) dashboard for demonstrating and testing the existing Inventory & Order Management API in `../backend`. The backend is used exactly as is: this app only calls its existing endpoints and shows their responses.

## Setup

```bash
cd frontend
npm install
cp .env.example .env      # set VITE_API_BASE_URL
npm run dev               # http://localhost:5173
```

Production build:

```bash
npm run build             # output in frontend/dist
npm run preview           # serves the build on http://localhost:4173
```

## Configuration

| Variable            | Default                 | Description                                                        |
| ------------------- | ----------------------- | ------------------------------------------------------------------ |
| `VITE_API_BASE_URL` | `http://localhost:5000` | Backend base URL with no trailing slash. It is read at build time. |

To run the backend locally, run `cd backend && npm run dev`; it listens on port 5000. On Render, the Blueprint in the repository root sets `VITE_API_BASE_URL` for you. The backend allows browser access through `CORS_ORIGIN` (default `*`).

## Logging in

Use an existing account:

- **ADMIN:** the account created by the backend seed from `ADMIN_EMAIL` and `ADMIN_PASSWORD` in the root `.env`.
- **STAFF:** any account created on the Staff page, or with `POST /auth/register`.

## Pages and the endpoints they use

| Page          | Endpoints                                                                                                             |
| ------------- | --------------------------------------------------------------------------------------------------------------------- |
| Login         | `POST /auth/login`                                                                                                    |
| Dashboard     | `GET /health`, `GET /products` (all pages), `GET /orders`, `GET /reports/low-stock`                                   |
| Products      | `GET /products?page&limit&search`, `GET /products/:id`, `POST /products`, `PUT /products/:id`, `DELETE /products/:id` |
| Inventory     | `GET /products` (all pages), `PUT /products/:id` (stock only)                                                         |
| Staff         | `POST /auth/register` (always creates STAFF), `GET /users/me`                                                         |
| Orders        | `GET /products`, `POST /orders`, `GET /orders?page&limit`                                                             |
| Order details | `GET /orders/:id`                                                                                                     |
| Reports       | `GET /reports/low-stock?threshold`                                                                                    |

The order screen shows an **estimated** total for the items you've selected, calculated from list prices. The confirmed total, the stock checks and the stock deduction all come from the backend's response to `POST /orders`.

If a read-only `GET` request returns `503`, which can happen while a sleeping backend wakes up, the app retries it once.

**Roles:** each role gets its own dashboard. All role rules live in `src/auth/permissions.js`, which mirrors the backend's `authorize(...)` rules, and that one file drives the sidebar, route protection and buttons:

- **ADMIN:** Dashboard, Products (add, edit, delete), Inventory (stock updates), Staff Management, Orders, Reports.
- **STAFF:** Dashboard, Products (read-only, so no add, edit or delete controls), Orders (create and view).
- **Opening a page your role can't use,** for example by typing its URL, shows an "Access denied" page.
- **On reload,** the role is re-read from `GET /users/me`.
- **The backend stays the final authority.** Stock checks, totals and stock deduction for orders all happen there.

**Sessions:** the JWT is stored in `localStorage` and sent as `Authorization: Bearer <token>`. Any 401 on an authenticated request, such as an expired token, logs the user out.

## Not available (no matching backend endpoint)

- Listing, editing or deleting existing users or staff
- A total user count on the dashboard
- Order status (orders have no status field)
