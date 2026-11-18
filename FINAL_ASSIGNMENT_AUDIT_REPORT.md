# Final Assignment Audit Report: Inventory & Order Management API

**Audit date:** 2026-11-18
**Branch audited:** `feature/inventory-order-management-api`
**Source of truth:** _Node.js Practical Task: Inventory and Order API_ (the interviewer's PDF)

---

## 1. Executive summary

The project meets **every mandatory requirement in the assignment PDF** and two of the three bonus items, each verified by tests that were actually run. The third bonus item, Docker, is written but could not be run here.

The audit found **5 real issues**, and all of them are fixed:

1. Registration required a `name` field. The assignment specifies registration "with email and password".
2. Product search treated `%` and `_` as SQL wildcards, so `search=_` matched every product.
3. The bonus "unit tests for the order logic" was only partly covered.
4. `render.yaml` combined the free plan with a paid-only `preDeployCommand`, which blocked the deployment the PDF asks for.
5. The Postman "Create product" request used a SKU that the seed already creates. On a seeded database it returned 409, and the following "Delete product" request would then have targeted the seeded product.

**Final automated result: 144 tests, 144 passed, 0 failed, 0 skipped**, across 10 files, run against the real Neon database. The suite was run in full three times during the audit, and all runs passed.

**Remaining submission blockers** need your action, not code changes:

- **Push** the branch to GitHub.
- **Deploy** to Render and share the link. The PDF requires a deployment link.

---

## 2. Original assignment requirements (from the PDF)

**Stack:** Node.js with Express, plus MySQL or PostgreSQL. Any ORM or query builder is allowed.

1. **Authentication**
   - `POST /auth/register` and `POST /auth/login` with email and password.
   - Passwords must be hashed.
   - Login returns a JWT.
   - Two roles: admin and staff.
2. **Products** (only admin can create, update or delete)
   - Fields: name, SKU (unique), price, stock quantity.
   - `GET /products` supports pagination (`page`, `limit`) and search by name or SKU.
   - Price must be greater than 0, and stock cannot be negative.
3. **Orders** (admin and staff)
   - `POST /orders` accepts `[{ productId, quantity }]`.
   - Stock is checked for every item. If any item has too little stock, the whole order is rejected and nothing changes.
   - On success, stock is reduced and the order is saved with its total amount.
   - The stock update and order creation run inside **one database transaction**.
   - `GET /orders/:id` returns the order with its items and product names.
4. **Report:** `GET /reports/low-stock?threshold=10` returns products below the given stock level.

**Rules**

- Validate all input and return clear error messages with the correct status codes (400, 401, 403, 404, 409).
- Use one central error-handling middleware.
- Keep secrets in `.env` and include a `.env.example`.
- Provide a README with setup steps and a SQL schema or migration.

**Bonus**

- Two simultaneous orders for the last unit must not both succeed.
- Unit tests for the order logic.
- Docker setup.

**Submission**

- A GitHub repository link, with commits made during the task.
- A deployment on Vercel or Render, with its link.

---

## 3. Requirement traceability matrix

Verification key: **AUTO** means an automated test was executed; **LIVE** means a manual HTTP check against the compiled production build with the real Neon database; **DB** means a catalog query on Neon; **REVIEW** means the code was read but not executed.

| #   | Requirement                                                 | Expected behaviour                                                       | Implementation                                                       | Verification                                                                                  | Status                        |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------- |
| R1  | Register with email and password                            | 201 for `{email, password}`, user is STAFF                               | `src/modules/auth/auth.validation.ts`, `auth.service.ts`             | AUTO: `integration/auth.test.ts` "registers with only email and password", missing-field 400s | **PASS** (fixed during audit) |
| R2  | Login with email and password                               | 200 with a JWT; 401 on bad credentials                                   | `auth.service.ts` `login`                                            | AUTO: integration auth tests; LIVE admin login                                                | **PASS**                      |
| R3  | Passwords hashed                                            | Only a bcrypt hash is stored; it is never returned                       | `auth.service.ts` (bcryptjs), `users/user.service.ts` `toPublicUser` | AUTO: stored value matches `$2…`, no hash in any response                                     | **PASS**                      |
| R4  | Login returns a JWT                                         | HS256 token with `sub`, `email` and `role`                               | `signAccessToken`                                                    | AUTO: `unit/middleware.test.ts` decodes the claims                                            | **PASS**                      |
| R5  | Two roles, admin and staff                                  | Enum `ADMIN`/`STAFF`; public sign-up is always STAFF                     | `prisma/schema.prisma`, `auth.service.ts`                            | AUTO: sending `role: ADMIN` is ignored; DB enum confirmed                                     | **PASS**                      |
| R6  | Only admin can create, update or delete products            | STAFF gets 403                                                           | `products/product.routes.ts` with `authorize('ADMIN')`               | AUTO: unit and integration 403 tests; unchanged stock confirmed after the attempts            | **PASS**                      |
| R7  | Product fields; SKU unique                                  | name, sku, price, stock; duplicate SKU returns 409                       | schema with `@unique`; `product.service.ts`                          | AUTO: duplicate SKU returns 409 (case-insensitive); DB unique index confirmed                 | **PASS**                      |
| R8  | Pagination with `page` and `limit`                          | Correct slice plus metadata; invalid values give 400                     | `product.service.ts` `list`, `utils/pagination.ts`                   | AUTO: page 1 and 3, page past the end, page=0/abc and limit=0/-5/1000 give 400                | **PASS**                      |
| R9  | Search by name or SKU                                       | Case-insensitive literal substring on name OR SKU                        | `product.service.ts` (`escapeLikePattern`)                           | AUTO: name search, SKU search, literal `_`/`%`; LIVE checks                                   | **PASS** (fixed during audit) |
| R10 | Price > 0                                                   | 0 or negative values give 400; DB CHECK constraint                       | `product.validation.ts`; `CHECK (price > 0)`                         | AUTO: invalid price cases; DB constraint confirmed                                            | **PASS**                      |
| R11 | Stock not negative                                          | Negative gives 400; DB CHECK constraint                                  | `product.validation.ts`; `CHECK (stock >= 0)`                        | AUTO; DB constraint confirmed                                                                 | **PASS**                      |
| R12 | `POST /orders` with `[{productId, quantity}]`               | 201 with the order; invalid items give 400                               | `orders/order.validation.ts`, `order.controller.ts`                  | AUTO: empty order, zero/negative/fractional quantity, bad id                                  | **PASS**                      |
| R13 | Reject the whole order if any item is short; change nothing | 409; stock, orders and items all unchanged                               | `order.service.ts` `createOrder`                                     | AUTO: integration A=10/B=2 rollback, unit rollback with mocked DB, duplicate lines over stock | **PASS**                      |
| R14 | On success, reduce stock and save the total                 | Stock decremented; exact decimal total stored                            | `order.service.ts`                                                   | AUTO: totals `102399.97` and `100000.30`, stock 10→8 and 5→2                                  | **PASS**                      |
| R15 | One database transaction                                    | Stock update, order and items all in one `$transaction`                  | `order.service.ts` (`prisma.$transaction`, READ COMMITTED)           | AUTO: unit test asserts a single transaction; integration rollback proves atomicity           | **PASS**                      |
| R16 | `GET /orders/:id` with items and product names              | Order, items, `productName`, quantities, price snapshots; 404 if missing | `order.service.ts` `getOrderById`                                    | AUTO: retrieval, snapshot survives a later price change, 404                                  | **PASS**                      |
| R17 | Orders available to admin and staff                         | Both roles can create and read                                           | `orders/order.routes.ts`                                             | AUTO: STAFF creates, ADMIN reads                                                              | **PASS**                      |
| R18 | Low-stock report                                            | `stock < threshold`, default 10, validated                               | `reports/*`                                                          | AUTO: default, custom, empty, invalid threshold, 401; LIVE                                    | **PASS**                      |
| R19 | Validate all input, with clear messages                     | Zod on every body, query and param; per-field `details`                  | `*.validation.ts`, `utils/validation.ts`                             | AUTO: 38 validation unit tests plus route tests                                               | **PASS**                      |
| R20 | Status codes 400, 401, 403, 404, 409                        | Each used where it applies                                               | `utils/AppError.ts`, `error.middleware.ts`                           | AUTO: every code asserted in tests                                                            | **PASS**                      |
| R21 | One central error middleware                                | A single `errorHandler`; consistent JSON                                 | `src/middleware/error.middleware.ts`, `app.ts`                       | AUTO: malformed JSON, Zod, Prisma mapping, 500 with no internals                              | **PASS**                      |
| R22 | Secrets in `.env` plus `.env.example`                       | `.env` git-ignored; the example has placeholders only                    | `.gitignore`, `.env.example`, `config/env.ts`                        | `git ls-files` and secret scan (see §8)                                                       | **PASS**                      |
| R23 | README with setup and SQL migration                         | Setup steps; migration SQL committed                                     | `README.md`, `prisma/migrations/20261118000000_init/migration.sql`   | Migration applied to Neon; status "up to date"; README reviewed                               | **PASS**                      |
| R24 | Stack: Node, Express, PostgreSQL                            | Express 5 with PostgreSQL (Neon) and Prisma                              | `package.json`                                                       | Build and live run                                                                            | **PASS**                      |
| B1  | Bonus: concurrent last-unit orders                          | Exactly one succeeds; stock never negative                               | Conditional `UPDATE … WHERE stock >= q` under row locks              | AUTO: 2 racers → [201, 409]; 8 racers for 3 units → exactly 3 succeed, stock 0                | **PASS**                      |
| B2  | Bonus: unit tests for the order logic                       | Order logic tested without a database                                    | `tests/unit/order.service.test.ts`                                   | AUTO: 9 tests                                                                                 | **PASS** (added during audit) |
| B3  | Bonus: Docker setup                                         | Image builds and runs; compose works                                     | `Dockerfile`, `docker-compose.yml`, `.dockerignore`                  | REVIEW only; Docker is not installed on this machine                                          | **NOT TESTED**                |
| S1  | GitHub link with commits made during the task               | Remote repository contains the commit history                            | Local branch `feature/inventory-order-management-api`                | `git log` checked locally; **not pushed**, which needs your approval                          | **PARTIAL**                   |
| S2  | Deployment link (Vercel or Render)                          | Public URL serving the API                                               | `render.yaml` (fixed during audit), README                           | Not deployed; no URL exists                                                                   | **NOT TESTED**                |

---

## 4. Functional verification results

| Area                                                                                              | Executed                                | Result |
| ------------------------------------------------------------------------------------------------- | --------------------------------------- | ------ |
| Registration (full body, email and password only, duplicate, invalid, role injection)             | AUTO                                    | PASS   |
| Login (valid, wrong password, unknown email with an identical message)                            | AUTO and LIVE                           | PASS   |
| Product CRUD (create, read, partial update, delete, 404s, 409 when the product is used in orders) | AUTO                                    | PASS   |
| Pagination (metadata, last page, page past the end, invalid page and limit)                       | AUTO and LIVE                           | PASS   |
| Search (name, SKU, case-insensitive, literal wildcards, no matches)                               | AUTO and LIVE                           | PASS   |
| Order creation (totals, stock deduction, price snapshot, merged duplicate lines)                  | AUTO                                    | PASS   |
| Whole-order rejection and rollback                                                                | AUTO (integration and unit)             | PASS   |
| Concurrency (2 racers, and 8 racers for 3 units)                                                  | AUTO, real Neon                         | PASS   |
| Low-stock report                                                                                  | AUTO and LIVE                           | PASS   |
| Health check (200 when up, 503 when the database is down)                                         | AUTO (the outage is simulated) and LIVE | PASS   |

---

## 5. API endpoint test results

| Endpoint                 | Success                                    | Validation 400             | 401                | 403      | 404                | 409                   |
| ------------------------ | ------------------------------------------ | -------------------------- | ------------------ | -------- | ------------------ | --------------------- |
| `GET /health`            | ✅ 200 (and 503 when the database is down) | –                          | –                  | –        | –                  | –                     |
| `POST /auth/register`    | ✅ 201                                     | ✅                         | –                  | –        | –                  | ✅ duplicate email    |
| `POST /auth/login`       | ✅ 200                                     | ✅                         | ✅ bad credentials | –        | –                  | –                     |
| `GET /users/me`          | ✅ 200                                     | –                          | ✅                 | –        | –                  | –                     |
| `POST /products`         | ✅ 201                                     | ✅ price, stock, name, SKU | ✅                 | ✅ STAFF | –                  | ✅ SKU                |
| `GET /products`          | ✅ 200                                     | ✅ page and limit          | ✅                 | –        | –                  | –                     |
| `GET /products/:id`      | ✅ 200                                     | ✅ abc, 0, -1, 1.5         | ✅                 | –        | ✅                 | –                     |
| `PUT /products/:id`      | ✅ 200                                     | ✅ empty body              | ✅                 | ✅ STAFF | ✅                 | ✅ SKU                |
| `DELETE /products/:id`   | ✅ 204                                     | ✅                         | ✅                 | ✅ STAFF | ✅                 | ✅ used in an order   |
| `POST /orders`           | ✅ 201                                     | ✅                         | ✅                 | –        | ✅ unknown product | ✅ insufficient stock |
| `GET /orders`            | ✅ 200                                     | –                          | –                  | –        | –                  | –                     |
| `GET /orders/:id`        | ✅ 200                                     | –                          | ✅                 | –        | ✅                 | –                     |
| `GET /reports/low-stock` | ✅ 200                                     | ✅ -1, abc, 1.5, -5        | ✅                 | –        | –                  | –                     |

**Results by test file** (third full run, JSON reporter):

| File                                       | Tests   | Passed                        |
| ------------------------------------------ | ------- | ----------------------------- |
| `tests/unit/validation.test.ts`            | 38      | 38                            |
| `tests/unit/app.test.ts`                   | 20      | 20                            |
| `tests/unit/middleware.test.ts`            | 19      | 19                            |
| `tests/unit/order.service.test.ts` (new)   | 9       | 9                             |
| `tests/unit/utils.test.ts`                 | 7       | 7                             |
| `tests/unit/health.test.ts` (new)          | 1       | 1                             |
| `tests/integration/products.test.ts`       | 19      | 19                            |
| `tests/integration/orders.test.ts`         | 16      | 16                            |
| `tests/integration/auth.test.ts`           | 9       | 9                             |
| `tests/integration/reports-health.test.ts` | 6       | 6                             |
| **Total**                                  | **144** | **144** (0 failed, 0 skipped) |

---

## 6. Authentication and authorization verification

**Executed:**

- **Missing, malformed, wrong-scheme and forged tokens** are all rejected with 401.
- **Expired tokens** get 401 with `TOKEN_EXPIRED`.
- **Tokens with `alg: none`** are rejected, because only HS256 is accepted.
- **Tokens with an unknown role claim** are rejected.
- **STAFF** gets 403 on POST, PUT and DELETE for products.
- **ADMIN** can perform all product operations.
- **Both roles** can create and read orders and read the report.

**Reviewed:**

- A failed login takes about the same time whether or not the email exists, because bcrypt always runs against a dummy hash. Both cases also return the same message.
- Passwords longer than 72 bytes are rejected rather than silently truncated.

---

## 7. Database and transaction verification

**Checked on Neon (DB):**

- All 4 tables exist.
- Foreign keys behave as intended: order items are deleted with their order, and products and users referenced by orders can't be deleted.
- All 5 CHECK constraints exist: price > 0, stock >= 0, total >= 0, quantity > 0, item price > 0.
- Indexes exist on email, SKU, product name, stock, the order's user, the order's date, and order item (order, product).
- `prisma migrate status` reports "Database schema is up to date".
- `public` still holds only the seed data (1 admin, 5 products, 0 orders). The test schema `inventory_test` was empty after every run.

**Transaction design** (`order.service.ts`):

- One interactive `prisma.$transaction` at READ COMMITTED.
- Stock is deducted with a conditional atomic update: `UPDATE … SET stock = stock - q WHERE id = ? AND stock >= q`.
- Products are locked in ascending ID order, which prevents deadlocks.
- Any shortfall throws inside the transaction, which rolls back every change.
- Prices are snapshotted after the rows are locked.
- Totals are calculated with `Prisma.Decimal`, so there is no float rounding.

This is verified by the integration rollback and concurrency tests, plus the new unit tests.

---

## 8. Security audit findings

| Check                        | Result                                                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `.env` tracked by git        | **No.** It is git-ignored; `git ls-files` doesn't list it.                                                             |
| Credentials in tracked files | **None.** Scanned for Neon password patterns and the host name.                                                        |
| Hardcoded secrets            | **None.** Everything comes from env vars validated by Zod; the app refuses to start on invalid config.                 |
| Password storage             | bcrypt with 12 rounds by default (4 in tests only).                                                                    |
| SQL injection                | Parameterized Prisma queries only. Search wildcards are now escaped.                                                   |
| Error leakage                | A generic 500 message; stack traces only when `NODE_ENV=development`. Verified by test and by the live production run. |
| Headers                      | Helmet active, `x-powered-by` disabled (tested).                                                                       |
| Body size                    | JSON limit is 100 KB.                                                                                                  |
| CORS                         | Configurable through `CORS_ORIGIN`.                                                                                    |
| TLS to Neon                  | `sslmode=verify-full` for the runtime pool; `db:check` confirms client TLS on both connections.                        |

**Observations, not fixed because they are outside the assignment's scope:**

- There's no rate limiting on `/auth/*`.
- The role is read from the JWT, so a role change only takes effect when the token expires (default 1 day).
- A token for a user who has since been deleted gets a 409 on order creation, not a 401.
- STAFF can read every order. That follows the PDF, which says orders are for "admin and staff".
- The password rule (8+ characters, at least one letter and one digit) is stricter than the PDF requires. It's documented in the README.

---

## 9. Code quality and build results

All of these were executed during this audit.

| Check                          | Command                                   | Result                                                            |
| ------------------------------ | ----------------------------------------- | ----------------------------------------------------------------- |
| TypeScript type check (strict) | `npm run typecheck`                       | ✅ 0 errors                                                       |
| ESLint                         | `npm run lint`                            | ✅ 0 problems                                                     |
| Prettier                       | `npm run format:check`                    | ✅ all files formatted                                            |
| Prisma schema                  | `npm run prisma:validate`                 | ✅ valid                                                          |
| Production build               | `npm run build`                           | ✅                                                                |
| Production start               | `NODE_ENV=production node dist/server.js` | ✅ starts; health, login, search and validation checked over HTTP |
| Migration status               | `npm run db:migrate:status`               | ✅ up to date                                                     |
| Unit tests                     | `npm run test:unit`                       | ✅ 94 of 94                                                       |
| Integration tests              | included in `npm test`                    | ✅ 50 of 50                                                       |

---

## 10. Documentation and Postman verification

- **README:** covers setup, every env var, Neon setup, Prisma 7, migrations, seed, run commands, the endpoint table with examples, auth flow, role matrix, error codes, transaction design, testing, Postman, Docker and Render. It was updated during the audit for optional `name`, literal search, the Render build command and the new unit tests.
- **Postman:** every request maps to an existing route, checked automatically (16 requests across 5 folders). The "Create product" SKU is now `LAP-{{$timestamp}}`, so it no longer collides with the seed. **NOT TESTED** inside the Postman app.
- **No mismatches remain** between the README, the Postman collection, the routes and the PDF.

---

## 11. Deployment readiness

| Item                               | Status                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| Build and start commands           | Verified locally                                                                           |
| `PORT` from the environment        | Reviewed and verified (ports 5055–5058 used locally)                                       |
| `/health` as Render's health check | Verified (200 when up, 503 when down)                                                      |
| Migrations on deploy               | `render.yaml` build command runs `npm run db:migrate:deploy`, which works on the free plan |
| Graceful shutdown on SIGTERM       | **Code reviewed, not executed.** Windows can't send SIGTERM.                               |
| Docker image                       | **NOT TESTED** (Docker isn't installed). The Dockerfile and compose files were reviewed.   |
| Render deployment                  | **NOT TESTED.** Not deployed, so there's no URL.                                           |

---

## 12. Issues discovered and fixes implemented

| #   | Issue                                                                                                                             | Requirement affected                       | Files                                                             | Fix                                                           | Tests                                                                                                                                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `POST /auth/register` returned 400 without `name`                                                                                 | Auth: "register … with email and password" | `auth.validation.ts`, `auth.service.ts`                           | `name` is now optional and defaults to the email's local part | Integration: email+password registration and login, missing-field 400s. The unit case that expected a missing `name` to fail was replaced by an invalid `name` (one character), which is still asserted to fail. |
| 2   | `%` and `_` in search acted as wildcards (`search=_` returned all 5 products in the live check)                                   | Products: "search by name or SKU"          | `product.service.ts`                                              | `escapeLikePattern` escapes `\`, `%` and `_`                  | Unit: escaping. Integration: literal `_` and `%`. Live: `_` and `%` now return 0.                                                                                                                                |
| 3   | The order logic had no unit tests, only the line-merging helper                                                                   | Bonus: "Unit tests for the order logic"    | `tests/unit/order.service.test.ts` (new)                          | 9 tests against a mocked transactional DB                     | 9 of 9 pass                                                                                                                                                                                                      |
| 4   | `render.yaml` used `plan: free` with a paid-only `preDeployCommand`                                                               | Submission: deploy to Render               | `render.yaml`, `README.md`                                        | Migrations moved into the build command                       | Config reviewed. Deployment NOT TESTED.                                                                                                                                                                          |
| 5   | Postman "Create product" collided with the seeded SKU `LAP-001`, giving 409, after which "Delete" would target the seeded product | Postman deliverable                        | `scripts/build-postman.mjs`, collection JSON                      | SKU `LAP-{{$timestamp}}`                                      | Collection regenerated; routes checked. Not run in Postman.                                                                                                                                                      |
| –   | Coverage gaps: database outage on `/health`, pagination edge cases, invalid IDs                                                   | Rules: validation and status codes         | `tests/unit/health.test.ts`, `tests/integration/products.test.ts` | New tests only, no code changes                               | All pass                                                                                                                                                                                                         |

No existing assertions were weakened, and no tests were deleted.

---

## 13. Remaining limitations and NOT TESTED items

**NOT TESTED** (needs tools or services that aren't available here):

- Docker image build and `docker compose up`, because Docker isn't installed.
- Render deployment and a public URL.
- Graceful SIGTERM shutdown, because it can't be sent on Windows.
- Running the Postman collection inside the Postman app.

**Pending your action:**

- Push to GitHub (S1).
- Deploy to Render (S2).

**Known design limitations:** see the observations in §8.

---

## 14. Final counts (traceability matrix, §3)

| Status         | Count                            |
| -------------- | -------------------------------- |
| PASS           | **26** (24 mandatory + 2 bonus)  |
| FAIL           | **0**                            |
| PARTIAL        | **1** (S1: not pushed yet)       |
| NOT TESTED     | **2** (B3 Docker, S2 deployment) |
| NOT APPLICABLE | **0**                            |

**Automated tests: 144 executed, 144 passed, 0 failed, 0 skipped.**

---

## 15. Overall submission readiness

**The code is ready.** All mandatory functional requirements pass with executed tests against the real Neon database, and so do the concurrency and order-logic unit-test bonuses.

**The submission is not complete yet.** Two steps from the PDF's "Submission" section need your approval and accounts:

1. Push the branch: `git push -u origin feature/inventory-order-management-api`. Consider also merging into `main`, or opening a PR, so the interviewer sees the code on the default branch.
2. Deploy on Render: **New → Blueprint** with this repository, then set `DATABASE_URL`, `DIRECT_URL`, `ADMIN_EMAIL` and `ADMIN_PASSWORD`. After the first deploy, run `npm run db:seed` from the Render Shell, check that `https://<service>.onrender.com/health` returns 200, and share that URL.
