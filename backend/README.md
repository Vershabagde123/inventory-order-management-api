# Inventory & Order Management API

A REST API for managing products, stock and customer orders, built with **Node.js, Express 5, TypeScript, Prisma 7 and Neon PostgreSQL**.

The core requirement is **transaction-safe ordering**. An order is created atomically: either every line is reserved and the order is stored, or nothing changes. Stock can never be oversold, even when many requests try to buy the last unit at the same moment.

---

## Table of contents

1. [Features](#features)
2. [Technology stack](#technology-stack)
3. [Architecture](#architecture)
4. [Folder structure](#folder-structure)
5. [Prerequisites](#prerequisites)
6. [Installation](#installation)
7. [Environment configuration](#environment-configuration)
8. [Neon PostgreSQL setup](#neon-postgresql-setup)
9. [Prisma configuration](#prisma-configuration)
10. [Migrations](#migrations)
11. [Seeding](#seeding)
12. [Running the application](#running-the-application)
13. [API reference](#api-reference)
14. [Authentication & roles](#authentication--roles)
15. [Error responses](#error-responses)
16. [Order transactions & concurrency](#order-transactions--concurrency)
17. [Automated testing](#automated-testing)
18. [Postman collection](#postman-collection)
19. [Docker](#docker)
20. [Deploying to Render](#deploying-to-render)
21. [npm scripts](#npm-scripts)

---

## Features

- **Authentication**: register and login with bcrypt-hashed passwords and JWT (HS256) access tokens.
- **Role-based authorization**: `ADMIN` and `STAFF`. Public sign-ups are always `STAFF`, and the admin account is created by the seed script.
- **Products**: full CRUD, unique SKU, positive price, non-negative stock, pagination, and case-insensitive search by name or SKU.
- **Orders**: multi-line orders created in **one database transaction**, with price snapshots, exact decimal totals and aggregation of duplicate lines.
- **Concurrency protection**: atomic conditional stock decrements under row-level locks, so stock is never oversold and never goes negative.
- **Low-stock report**: products whose stock is strictly below a threshold (default 10).
- **Validation**: Zod schemas for every body, query string and route parameter.
- **Centralized error handling**: one consistent JSON error format, with Prisma errors mapped to HTTP status codes and no stack traces outside development.
- **Database integrity**: foreign keys, unique indexes, and `CHECK` constraints (`price > 0`, `stock >= 0`, `quantity > 0`).
- **Migrations and an idempotent seed**.
- **Health check**: `GET /health` verifies that the database can be reached.
- **Security**: Helmet, CORS, JSON body size limit, environment-validated secrets, and a uniform login failure path that doesn't reveal which emails exist.
- **Tests**: Vitest and Supertest unit and integration suites, including concurrency tests.
- **Docker**, a **Render blueprint** and a **Postman collection**.

## Technology stack

| Concern    | Choice                                                                       |
| ---------- | ---------------------------------------------------------------------------- |
| Runtime    | Node.js ≥ 22.12 (developed on Node 26, Docker image uses Node 24 LTS)        |
| Framework  | Express 5 (native async error propagation)                                   |
| Language   | TypeScript 6 (`strict`, `noUncheckedIndexedAccess`, NodeNext ESM)            |
| Database   | Neon serverless PostgreSQL                                                   |
| ORM        | Prisma 7 with the `@prisma/adapter-pg` driver adapter (no Rust query engine) |
| Auth       | `jsonwebtoken`, `bcryptjs` (pure-JS bcrypt, so no native build step)         |
| Validation | Zod 4                                                                        |
| Security   | Helmet, CORS                                                                 |
| Testing    | Vitest, Supertest                                                            |
| Quality    | ESLint 10 (flat config with typescript-eslint), Prettier                     |

## Architecture

The app is a **modular monolith**. Each feature module owns its routes, controller, service and validation:

```
HTTP request
   │
   ▼
Express app (helmet, cors, json body limit)
   │
   ▼
Router ──► authenticate (JWT) ──► authorize(roles)
   │
   ▼
Controller   – parses input with Zod, calls the service, shapes the HTTP response
   │
   ▼
Service      – business rules and transactions (the only layer that talks to Prisma)
   │
   ▼
Prisma Client + @prisma/adapter-pg ──► Neon (pooled endpoint)

Any thrown error ──► central error middleware ──► consistent JSON error
```

- **Controllers are thin.** They have no business logic and no try/catch, because Express 5 forwards rejected promises to the error middleware.
- **Services hold all business logic**, which keeps it testable and independent of HTTP.
- **`AppError`** carries an HTTP status, a stable `code` and optional `details`. Zod, Prisma and body-parser errors are converted to it centrally.

## Folder structure

The backend lives in `backend/` of the repository; the React frontend is in `../frontend`.

```
backend/
├── prisma/
│   ├── schema.prisma               # data model (no URLs, Prisma 7 style)
│   ├── migrations/                 # SQL migrations (incl. CHECK constraints)
│   └── seed.ts                     # idempotent admin + sample products
├── prisma.config.ts                # Prisma CLI config (DIRECT_URL for migrations)
├── src/
│   ├── app.ts                      # express app factory (used by server & tests)
│   ├── server.ts                   # HTTP server + graceful shutdown
│   ├── config/
│   │   ├── env.ts                  # zod-validated environment
│   │   └── database.ts             # Prisma client (pooled DATABASE_URL)
│   ├── middleware/
│   │   ├── auth.middleware.ts      # JWT authentication
│   │   ├── role.middleware.ts      # role authorization
│   │   └── error.middleware.ts     # 404 + central error handler
│   ├── modules/
│   │   ├── auth/                   # register, login, JWT helpers
│   │   ├── users/                  # user persistence, GET /users/me
│   │   ├── products/               # CRUD, pagination, search
│   │   ├── orders/                 # transactional ordering
│   │   └── reports/                # low-stock report
│   ├── utils/                      # AppError, money, pagination, shared zod schemas
│   ├── types/                      # shared TS types, Express augmentation
│   └── generated/prisma/           # generated Prisma Client (git-ignored)
├── tests/
│   ├── unit/                       # no database required
│   └── integration/                # real Neon DB, isolated test schema
├── scripts/
│   ├── check-db.ts                 # read-only connectivity check
│   ├── migrate-test-db.ts          # migrate the isolated test schema
│   └── build-postman.mjs           # regenerates the Postman collection
├── postman/                        # Postman collection
├── Dockerfile, docker-compose.yml
└── .env.example                    # (render.yaml lives at the repository root)
```

## Prerequisites

- Node.js **22.12+** and npm 10+
- A **Neon** PostgreSQL project (free tier is fine)
- (Optional) Docker, Postman

## Installation

```bash
git clone https://github.com/Vershabagde123/inventory-order-management-api.git
cd inventory-order-management-api/backend
npm install
cp .env.example .env         # then fill in the values (see below)
npm run prisma:generate      # generate the Prisma client
```

## Environment configuration

All configuration is read from environment variables and validated at start-up in `src/config/env.ts`. If any value is missing or invalid, the app refuses to start. The error message lists the variable names only, never their values.

| Variable               | Required | Default          | Description                                                           |
| ---------------------- | -------- | ---------------- | --------------------------------------------------------------------- |
| `NODE_ENV`             | no       | `development`    | `development`, `test` or `production`                                 |
| `PORT`                 | no       | `5000`           | HTTP port (Render injects its own)                                    |
| `DATABASE_URL`         | **yes**  | –                | Neon **pooled** connection string, used by the app at runtime         |
| `DIRECT_URL`           | **yes**¹ | –                | Neon **direct** connection string, used by Prisma Migrate             |
| `JWT_SECRET`           | **yes**  | –                | at least 32 characters                                                |
| `JWT_EXPIRES_IN`       | no       | `1d`             | e.g. `3600`, `15m`, `12h`, `1d`                                       |
| `BCRYPT_SALT_ROUNDS`   | no       | `12`             | 4–15                                                                  |
| `CORS_ORIGIN`          | no       | `*`              | comma-separated allowed origins                                       |
| `ADMIN_NAME`           | seed     | `System Admin`   | seed admin's display name                                             |
| `ADMIN_EMAIL`          | seed     | –                | seed admin's email                                                    |
| `ADMIN_PASSWORD`       | seed     | –                | seed admin's password (8–72 characters)                               |
| `SEED_SAMPLE_PRODUCTS` | no       | `true`           | insert 5 sample products when seeding                                 |
| `TEST_DB_SCHEMA`       | no       | `inventory_test` | isolated Postgres schema for integration tests (must not be `public`) |

¹ Required for migrations and integration tests.

Generate a strong JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

> `.env` is git-ignored. Only `.env.example`, which contains placeholders, is committed.

## Neon PostgreSQL setup

1. In the [Neon console](https://console.neon.tech), open your project and choose **Connect**.
2. Copy **two** connection strings for the same database and role:
   - **Pooled** (toggle _Connection pooling_ **on**; the host contains `-pooler`). Put it in `DATABASE_URL`.
   - **Direct** (pooling **off**). Put it in `DIRECT_URL`.
3. Keep `sslmode=require` in both URLs. Neon requires TLS.
4. Verify connectivity. This script is read-only and never prints credentials:

   ```bash
   npm run db:check
   ```

   It reports, for each URL, whether it is pooled, the SSL status, the server version, the existing tables and the applied migrations.

**Why two URLs?** Neon's pooler is PgBouncer in _transaction_ mode. That suits the many short application transactions, but schema migrations need a direct session, so Prisma Migrate uses `DIRECT_URL`.

## Prisma configuration

Prisma 7 no longer keeps connection URLs in `schema.prisma`:

- **`prisma.config.ts`** configures the **CLI** (migrate, status). Its datasource URL is `DIRECT_URL`.
- **`src/config/database.ts`** configures the **runtime** client: `new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) })`.
- The client is generated to `src/generated/prisma` (git-ignored) with the `prisma-client` generator as ESM.

Data model:

```
User 1 ──── * Order 1 ──── * OrderItem * ──── 1 Product
```

| Table         | Key columns / constraints                                                                                                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `users`       | `id` PK, `email` UNIQUE, `password` (bcrypt hash), `role` enum `ADMIN`/`STAFF` (default `STAFF`), timestamps                                                                                                       |
| `products`    | `id` PK, `sku` UNIQUE, `price NUMERIC(12,2)` `CHECK (price > 0)`, `stock INT` `CHECK (stock >= 0)`, indexes on `name` and `stock`                                                                                  |
| `orders`      | `id` PK, `user_id` FK → users (`ON DELETE RESTRICT`), `total_amount NUMERIC(14,2)` `CHECK (>= 0)`, indexes on `user_id` and `created_at`                                                                           |
| `order_items` | `id` PK, `order_id` FK → orders (`ON DELETE CASCADE`), `product_id` FK → products (`ON DELETE RESTRICT`), `quantity` `CHECK (> 0)`, `price` (unit-price snapshot) `CHECK (> 0)`, UNIQUE (`order_id`, `product_id`) |

Deletion behaviour:

- Deleting an order deletes its items.
- A product or user referenced by an order **cannot** be deleted. The API returns `409 PRODUCT_IN_USE`, which keeps the order history intact.

## Migrations

The migration SQL lives in `prisma/migrations/`. The initial migration was generated with `prisma migrate diff`, then the `CHECK` constraints that Prisma's schema language can't express were added by hand.

```bash
npm run db:migrate:status    # show applied / pending migrations
npm run db:migrate:deploy    # apply pending migrations (production-safe, never resets)
```

`prisma migrate deploy` only applies pending migrations. It never drops data and never prompts for a reset.

> **Do not run** `prisma migrate reset` or `prisma migrate dev` against a database that holds real data. `migrate dev` may offer to reset the database when it detects drift.

**Adding a migration later:** edit `schema.prisma`, then generate the SQL without touching any database:

```bash
npx prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --script \
  -o prisma/migrations/<timestamp>_<name>/migration.sql
npm run db:migrate:deploy
```

## Seeding

```bash
npm run db:seed
```

- Creates **one ADMIN** from `ADMIN_NAME`, `ADMIN_EMAIL` and `ADMIN_PASSWORD`. If that email already exists, the seed skips it and never overwrites the password. If the email belongs to a `STAFF` user, it is **not** promoted. The seed prints a warning instead, because someone may have registered that email publicly.
- Inserts 5 sample products when `SEED_SAMPLE_PRODUCTS=true`. Existing SKUs are skipped, so real stock levels are never reset.
- It is safe to run repeatedly, and it never deletes anything.

## Running the application

```bash
npm run dev       # development with reload (tsx watch)  → http://localhost:5000
npm run build     # prisma generate + tsc → dist/
npm start         # node dist/server.js (production)
```

Typical first run:

```bash
npm install
cp .env.example .env            # fill in Neon URLs, JWT secret, admin credentials
npm run db:check
npm run db:migrate:deploy
npm run db:seed
npm run dev
curl http://localhost:5000/health
```

## API reference

Base URL (local): `http://localhost:5000`. All request and response bodies are JSON. **Money values are returned as strings with two decimals** (for example `"50000.00"`), because floats are not exact.

| Method | Path                              | Auth | Roles        | Description                             |
| ------ | --------------------------------- | ---- | ------------ | --------------------------------------- |
| GET    | `/health`                         | –    | –            | Health and database connectivity        |
| POST   | `/auth/register`                  | –    | –            | Register (always `STAFF`)               |
| POST   | `/auth/login`                     | –    | –            | Log in and receive a JWT                |
| GET    | `/users/me`                       | JWT  | ADMIN, STAFF | Current user profile                    |
| POST   | `/products`                       | JWT  | ADMIN        | Create a product                        |
| GET    | `/products?page&limit&search`     | JWT  | ADMIN, STAFF | List, paginate and search products      |
| GET    | `/products/:id`                   | JWT  | ADMIN, STAFF | Get a product                           |
| PUT    | `/products/:id`                   | JWT  | ADMIN        | Update a product (any subset of fields) |
| DELETE | `/products/:id`                   | JWT  | ADMIN        | Delete a product                        |
| POST   | `/orders`                         | JWT  | ADMIN, STAFF | Create an order (transactional)         |
| GET    | `/orders?page&limit`              | JWT  | ADMIN, STAFF | List orders, newest first               |
| GET    | `/orders/:id`                     | JWT  | ADMIN, STAFF | Order details with items                |
| GET    | `/reports/low-stock?threshold=10` | JWT  | ADMIN, STAFF | Products with stock below threshold     |

### Auth

**POST /auth/register**

```json
{ "email": "jane@example.com", "password": "Password123" }
```

`name` is optional. When it is omitted, the email's local part is used as the display name (`jane` above). You can also send it explicitly:

```json
{ "name": "Jane Staff", "email": "jane@example.com", "password": "Password123" }
```

`201 Created`

```json
{
  "success": true,
  "data": {
    "user": {
      "id": 2,
      "name": "Jane Staff",
      "email": "jane@example.com",
      "role": "STAFF",
      "createdAt": "2026-11-18T10:00:00.000Z",
      "updatedAt": "2026-11-18T10:00:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "tokenType": "Bearer",
    "expiresIn": "1d"
  }
}
```

Validation rules: `email` and `password` are required. `name` is optional, 2–100 characters when given. `email` must be a valid address and is lower-cased. `password` must be 8–72 bytes and contain at least one letter and one digit. Any `role` field is ignored. A duplicate email returns **409** `EMAIL_ALREADY_EXISTS`.

**POST /auth/login**

```json
{ "email": "admin@example.com", "password": "your-admin-password" }
```

`200 OK` returns the same shape as register. A wrong email or password returns **401** `INVALID_CREDENTIALS`, and the message is identical in both cases.

### Products

**POST /products** (ADMIN)

```json
{ "name": "Laptop", "sku": "LAP-001", "price": 50000, "stock": 10 }
```

`201 Created`

```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Laptop",
    "sku": "LAP-001",
    "price": "50000.00",
    "stock": 10,
    "createdAt": "2026-11-18T10:00:00.000Z",
    "updatedAt": "2026-11-18T10:00:00.000Z"
  }
}
```

Validation rules:

- `name` is required, up to 200 characters.
- `sku` is required, up to 64 characters of `A-Z 0-9 - _`. It is stored **upper-cased**, so SKUs are unique regardless of case.
- `price` is a number or numeric string, greater than 0, with at most 2 decimal places.
- `stock` is an integer ≥ 0.

A duplicate SKU returns **409** `SKU_ALREADY_EXISTS`.

**GET /products?page=1&limit=10&search=laptop**

- `page` defaults to 1.
- `limit` defaults to 10, with a maximum of 100.
- `search` matches the name **or** the SKU, case-insensitively, as a literal substring (`%` and `_` are not wildcards).

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Laptop",
      "sku": "LAP-001",
      "price": "50000.00",
      "stock": 10,
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "totalRecords": 1,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPreviousPage": false
  }
}
```

**PUT /products/:id** (ADMIN) accepts any subset of `name`, `sku`, `price` and `stock`, but at least one field:

```json
{ "price": 45999.5, "stock": 7 }
```

**DELETE /products/:id** (ADMIN) returns `204 No Content`. It returns **404** if the product doesn't exist and **409** `PRODUCT_IN_USE` if the product appears in an order.

### Orders

**POST /orders**

```json
{
  "items": [
    { "productId": 1, "quantity": 2 },
    { "productId": 2, "quantity": 1 }
  ]
}
```

`201 Created`

```json
{
  "success": true,
  "data": {
    "id": 10,
    "user": { "id": 2, "name": "Jane Staff", "email": "jane@example.com" },
    "totalAmount": "100799.00",
    "createdAt": "2026-11-18T10:05:00.000Z",
    "items": [
      {
        "id": 21,
        "productId": 1,
        "productName": "Laptop",
        "sku": "LAP-001",
        "quantity": 2,
        "unitPrice": "50000.00",
        "lineTotal": "100000.00"
      },
      {
        "id": 22,
        "productId": 2,
        "productName": "Wireless Mouse",
        "sku": "MOU-001",
        "quantity": 1,
        "unitPrice": "799.00",
        "lineTotal": "799.00"
      }
    ]
  }
}
```

Rules:

- `items` must contain 1–100 entries.
- `productId` and `quantity` must be positive integers, and `quantity` can be at most 10,000.
- Duplicate `productId` lines are **merged**: their quantities are summed.

Errors:

| Situation                        | Status | Code                 |
| -------------------------------- | ------ | -------------------- |
| Empty or invalid body            | 400    | `VALIDATION_ERROR`   |
| One or more products don't exist | 404    | `NOT_FOUND`          |
| Not enough stock for any line    | 409    | `INSUFFICIENT_STOCK` |

```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Insufficient stock for one or more products. The order was not created.",
    "details": [
      {
        "field": "items",
        "productId": 2,
        "sku": "MOU-001",
        "productName": "Wireless Mouse",
        "requested": 5,
        "available": 2,
        "message": "Insufficient stock for Wireless Mouse: requested 5, available 2"
      }
    ]
  }
}
```

**GET /orders/:id** returns the same shape as the create response, or **404** if the order doesn't exist.

### Reports

**GET /reports/low-stock?threshold=10**

`threshold` is an integer ≥ 0 and defaults to 10. The report returns products with `stock < threshold`, lowest stock first, and returns `[]` when nothing matches.

```json
{
  "success": true,
  "threshold": 10,
  "count": 2,
  "data": [
    { "id": 5, "name": "USB-C Hub", "sku": "HUB-001", "price": "1499.00", "stock": 3 },
    { "id": 4, "name": "27\" Monitor", "sku": "MON-001", "price": "18999.00", "stock": 5 }
  ]
}
```

### Health

**GET /health** returns `200` when the database answers within 5 seconds and `503` otherwise:

```json
{ "status": "ok", "database": "up", "uptimeSeconds": 42, "timestamp": "2026-11-18T10:00:00.000Z" }
```

## Authentication & roles

Send the token on every protected request:

```
Authorization: Bearer <token>
```

The token is HS256-signed and carries `sub` (the user ID), `email` and `role`. Its expiry comes from `JWT_EXPIRES_IN`. Tokens with a missing, malformed or expired signature are rejected with **401**. Only `HS256` is accepted, so `alg: none` tokens are rejected too.

| Action                            | ADMIN | STAFF  |
| --------------------------------- | :---: | :----: |
| View products                     |  ✅   |   ✅   |
| Create / update / delete products |  ✅   | ❌ 403 |
| Create and view orders            |  ✅   |   ✅   |
| Low-stock report                  |  ✅   |   ✅   |

Admins are created by the seed script. The public `/auth/register` endpoint cannot create an `ADMIN`.

## Error responses

Every error uses the same shape:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": [{ "field": "price", "message": "price must be greater than 0" }]
  }
}
```

| Status | When                                                                                       | Example codes                                                                        |
| ------ | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| 400    | Invalid body, query or params; malformed JSON                                              | `VALIDATION_ERROR`, `INVALID_JSON`                                                   |
| 401    | Missing, invalid or expired token; bad credentials                                         | `MISSING_TOKEN`, `INVALID_TOKEN`, `TOKEN_EXPIRED`, `INVALID_CREDENTIALS`             |
| 403    | Authenticated but the role isn't allowed                                                   | `FORBIDDEN`                                                                          |
| 404    | Unknown route, product or order                                                            | `NOT_FOUND`                                                                          |
| 409    | Duplicate email or SKU, insufficient stock, product in use, concurrent conflict            | `EMAIL_ALREADY_EXISTS`, `SKU_ALREADY_EXISTS`, `INSUFFICIENT_STOCK`, `PRODUCT_IN_USE` |
| 500    | Unexpected error. A generic message is returned, and the stack trace only in `development` | `INTERNAL_SERVER_ERROR`                                                              |
| 503    | Database unavailable or busy                                                               | `DATABASE_UNAVAILABLE`, `TRANSACTION_UNAVAILABLE`                                    |

## Order transactions & concurrency

`OrderService.createOrder` (`src/modules/orders/order.service.ts`) runs everything inside **one interactive Prisma transaction** at `READ COMMITTED` isolation:

1. **Aggregate and sort.** Duplicate lines are merged and sorted by `productId`.
2. **Check existence.** If any product is missing, the API returns 404 and the transaction rolls back.
3. **Verify and deduct stock atomically**, one row at a time, in ascending ID order:
   ```sql
   UPDATE products SET stock = stock - $qty WHERE id = $id AND stock >= $qty
   ```
   If this affects zero rows, the stock is insufficient. The service collects every failing line, then **throws**. That rolls back every decrement already made in the transaction, and the API returns 409 with per-line details.
4. **Snapshot prices** from the rows this transaction now holds locks on.
5. **Compute the total** exactly with `Prisma.Decimal`.
6. **Create the order and its items** in one nested write.
7. **Commit.**

**Why this is safe under concurrency:** the `UPDATE` takes a row-level lock. A second transaction updating the same product blocks until the first commits. PostgreSQL then re-evaluates `stock >= qty` against the newly committed row. When two requests race for the last unit, the second one sees `stock = 0`, matches no rows, and its whole order rolls back. The service never trusts a value read earlier; the check and the deduction are a single statement.

**Deadlocks:** every transaction locks rows in the same ascending-ID order, so two orders that share products can't deadlock.

**Last line of defence:** the `CHECK (stock >= 0)` constraint guarantees that a bug can't persist negative stock.

**Why not SERIALIZABLE?** It would also be correct, but it aborts conflicting transactions with serialization failures that every client would have to retry. The conditional update gives the same guarantee under `READ COMMITTED` without retries.

## Automated testing

```bash
npm test                   # all tests
npm run test:unit          # unit tests only – no database needed
npm run test:integration   # integration tests – needs Neon credentials in .env
npm run test:coverage      # with coverage report
```

**Unit tests** (`tests/unit`) cover:

- validation schemas
- money and pagination helpers
- order-line aggregation
- the order logic with a mocked database: exact totals, stock deduction, whole-order rejection and rollback on insufficient stock, 404 for unknown products, ascending lock order, merging duplicate lines, and the single READ COMMITTED transaction
- the health check returning 503 when the database is down
- JWT signing and verification, including expired, forged, `alg: none` and bad-claim tokens
- the auth, role and error middleware
- route guards: 401 without a token, 403 for `STAFF` writes, 400 for invalid input

**Integration tests** (`tests/integration`) use the real Neon database and cover:

- registration and login
- role-based access control
- product CRUD, pagination and search
- orders: totals, stock deduction, full rollback, invalid input, duplicate lines, missing orders
- concurrency: two buyers racing for the last unit, and 8 buyers competing for 3 units
- the low-stock report and the health check

**Test database safety:**

- Integration tests run in an **isolated Postgres schema** (`TEST_DB_SCHEMA`, default `inventory_test`) inside the same Neon database. The Prisma adapter qualifies every query with that schema, so application data in `public` is never read or written.
- The Vitest global setup applies migrations to that schema with the non-destructive `prisma migrate deploy`. You can also run it by hand with `npm run test:db:migrate`.
- Every test file tags its records with a unique run ID and deletes **only those records** afterwards. Nothing in the suite runs `TRUNCATE`, `DROP` or a reset.
- If the database URLs are still placeholders, the integration suites are **skipped** with a warning and the unit tests still run.

For even stronger isolation, point `.env` at a dedicated Neon **branch** while you test.

## Postman collection

File: `postman/Inventory-Order-Management-API.postman_collection.json`

1. Open Postman and choose **Import**, then select the file.
2. Open the collection's **Variables** tab and set:
   - `baseUrl` (default `http://localhost:5000`)
   - `adminEmail` and `adminPassword` (the same values as your seed)
3. Run **Auth → Login (Admin)**. Its test script stores the JWT in `token` and `adminToken`.
4. Run **Auth → Register (STAFF)** and **Login (Staff)** to get a `staffToken`. You'll need it for the request that expects a 403.
5. The other requests use **Bearer `{{token}}`**, which is set at collection level. Product-write requests use `{{adminToken}}`. **Create product** and **Create order** store `productId` and `orderId` automatically.

To regenerate the collection, run `node scripts/build-postman.mjs`.

## Docker

```bash
# API container only. Uses the Neon URLs from .env:
docker compose up --build

# Apply migrations from inside the container (non-destructive):
docker compose run --rm app npx prisma migrate deploy
```

The production image leaves out dev dependencies, so the TypeScript seed doesn't run inside it. Seed from your machine with `npm run db:seed`. It uses the same `.env`, so it targets the same Neon database.

The image is a multi-stage `node:24-slim` build. It runs as a non-root user and has a `HEALTHCHECK` on `/health`.

**Optional local Postgres** (for offline development only). Docker **never** silently replaces Neon: the `postgres` service only starts with the `local-db` profile, and the API only uses it when you explicitly pass an env file that points at it.

```bash
# .env.docker-local (git-ignored) – copy your .env and change the two URLs:
#   DATABASE_URL="postgresql://inventory:inventory@postgres:5432/inventory?sslmode=disable"
#   DIRECT_URL="postgresql://inventory:inventory@postgres:5432/inventory?sslmode=disable"
docker compose --profile local-db --env-file .env.docker-local up --build
```

## Deploying to Render

The repository root contains a Render Blueprint (`render.yaml`) that deploys this API **and** the frontend together. The steps are in the [root README](../README.md#deploy-to-render-blueprint).

To create only the API service by hand instead, use these settings:

| Setting           | Value                                                                |
| ----------------- | -------------------------------------------------------------------- |
| Runtime           | Node                                                                 |
| Root directory    | `backend`                                                            |
| Build command     | `npm ci --include=dev && npm run build && npm run db:migrate:deploy` |
| Start command     | `npm start`                                                          |
| Health check path | `/health`                                                            |

`prisma migrate deploy` runs in the build step because the free plan has no pre-deploy step. It only applies pending migrations.

Set these environment variables in the Render dashboard:

- `NODE_ENV=production`
- `DATABASE_URL` (Neon pooled)
- `DIRECT_URL` (Neon direct)
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `BCRYPT_SALT_ROUNDS`
- `CORS_ORIGIN`
- `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`

Don't set `PORT`. Render injects it, and the server reads it.

To create the admin, open the service **Shell** once after the first deploy and run:

```bash
npm run db:seed
```

The server shuts down gracefully on `SIGTERM`: it stops accepting connections, drains in-flight requests and disconnects Prisma, then exits. This makes deploys zero-downtime.

## npm scripts

| Script                            | Purpose                                               |
| --------------------------------- | ----------------------------------------------------- |
| `npm run dev`                     | start in watch mode (tsx)                             |
| `npm run build`                   | `prisma generate`, then compile TypeScript to `dist/` |
| `npm start`                       | run the compiled server                               |
| `npm run typecheck`               | `tsc --noEmit` (includes tests and scripts)           |
| `npm run lint` / `lint:fix`       | ESLint                                                |
| `npm run format` / `format:check` | Prettier                                              |
| `npm run prisma:generate`         | generate Prisma Client                                |
| `npm run prisma:validate`         | validate `schema.prisma`                              |
| `npm run db:check`                | read-only Neon connectivity and table report          |
| `npm run db:migrate:status`       | migration status                                      |
| `npm run db:migrate:deploy`       | apply pending migrations (safe)                       |
| `npm run db:seed`                 | idempotent admin and sample-product seed              |
| `npm test`                        | run all tests                                         |
| `npm run test:unit`               | unit tests                                            |
| `npm run test:integration`        | integration tests                                     |
| `npm run test:coverage`           | tests with coverage                                   |
| `npm run test:db:migrate`         | migrate the isolated test schema                      |
