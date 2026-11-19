# STAFF Role API Test Report

**Date:** 2026-11-18
**Target:** the compiled production build (`NODE_ENV=production node dist/server.js`) at `http://127.0.0.1:5080`, connected to the Neon PostgreSQL `public` schema
**Method:** real HTTP requests using Node `fetch`, with direct SQL checks before and after each step through a separate read-only connection
**Secrets:** this report contains no JWTs, passwords or connection strings. Passwords appear as `***`.

---

## 1. Summary

| Category              |  Total | Passed | Failed | Not tested |
| --------------------- | -----: | -----: | -----: | ---------: |
| Authentication        |      8 |      8 |      0 |          0 |
| Product APIs          |      5 |      5 |      0 |          0 |
| Order APIs            |     15 |     15 |      0 |          0 |
| Reports               |      5 |      5 |      0 |          0 |
| Database verification |     13 |     13 |      0 |          0 |
| **Total**             | **46** | **46** |  **0** |      **0** |

**Bugs found:** none. All responses matched the API's documented contract, and no code was changed.

**Automated suite:** 144 of 144 still pass after this session (see §9).

---

## 2. STAFF user

| Item            | Result                                                                                                            |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| Registration    | `POST /auth/register` with `{ "email": "staff.testing@example.com", "password": "***" }` returned **201 Created** |
| User ID         | **2**                                                                                                             |
| Role            | **STAFF**, assigned automatically; no role was sent and none was changed by hand                                  |
| Name            | `staff.testing`, defaulted from the email's local part                                                            |
| Password in API | Not present in any response (no `password` field, no bcrypt hash)                                                 |
| Password in DB  | bcrypt hash `$2b$12$…`: cost 12, 60 characters, not the plain text                                                |
| Login           | `POST /auth/login` returned **200** with a JWT; `tokenType` is `Bearer`                                           |
| JWT claims      | `sub=2`, `email=staff.testing@example.com`, `role=STAFF`, valid for 86,400 s (1 day)                              |

The email didn't exist before, so registration was used rather than the login fallback. No duplicate user was created.

---

## 3. Endpoint results

### 3.1 Authentication

| #   | Method | URL              | Request                                                  | Expected | Actual | Result | Response summary                                         |
| --- | ------ | ---------------- | -------------------------------------------------------- | -------: | -----: | ------ | -------------------------------------------------------- |
| A1  | POST   | `/auth/register` | `{"email":"staff.testing@example.com","password":"***"}` |      201 |    201 | PASS   | User id 2, role STAFF, no password or hash in the body   |
| A2  | POST   | `/auth/login`    | `{"email":"staff.testing@example.com","password":"***"}` |      200 |    200 | PASS   | JWT issued with role STAFF                               |
| A3  | GET    | `/products`      | No `Authorization` header                                |      401 |    401 | PASS   | `MISSING_TOKEN`                                          |
| A4  | GET    | `/products`      | `Bearer invalid.jwt.token`                               |      401 |    401 | PASS   | `INVALID_TOKEN`                                          |
| A5  | GET    | `/products`      | Correctly signed JWT whose `exp` is in the past          |      401 |    401 | PASS   | `TOKEN_EXPIRED`                                          |
| A6  | GET    | `/products`      | Header `Bearer` with no token                            |      401 |    401 | PASS   | `INVALID_TOKEN`: "must be in the format: Bearer <token>" |
| A7  | GET    | `/products`      | Wrong scheme: `Token <jwt>`                              |      401 |    401 | PASS   | `INVALID_TOKEN`                                          |
| A8  | GET    | `/users/me`      | Valid STAFF JWT                                          |      200 |    200 | PASS   | id 2, role STAFF, no `password` field                    |

For A5, the expired token was signed locally with the server's own secret, read from `.env` in memory and never printed, so the test exercises expiry rather than a bad signature.

### 3.2 Product APIs (STAFF)

| #   | Method | URL                         | Request                                                                                     | Expected | Actual | Result | Response summary                                                      |
| --- | ------ | --------------------------- | ------------------------------------------------------------------------------------------- | -------: | -----: | ------ | --------------------------------------------------------------------- |
| P1  | GET    | `/products?page=1&limit=10` | –                                                                                           |      200 |    200 | PASS   | 5 products; `{page:1, limit:10, totalRecords:5, totalPages:1}`        |
| P2  | GET    | `/products/1`               | –                                                                                           |      200 |    200 | PASS   | LAP-001 Laptop, price 50000.00, stock 10                              |
| P3  | POST   | `/products`                 | `{"name":"Staff Should Not Create","sku":"STAFF-TEST-1795005941150","price":100,"stock":5}` |      403 |    403 | PASS   | `FORBIDDEN`: "This action requires role: ADMIN"; 0 rows with that SKU |
| P4  | PUT    | `/products/1`               | `{"name":"Hacked by staff","price":1,"stock":999}`                                          |      403 |    403 | PASS   | `FORBIDDEN`; the row is identical, including `updated_at`             |
| P5  | DELETE | `/products/1`               | –                                                                                           |      403 |    403 | PASS   | `FORBIDDEN`; the product still exists                                 |

Product IDs came from the P1 response, not from guesses. Product 1 (LAP-001, an existing seeded product) was the target for P4 and P5.

### 3.3 Order APIs (STAFF)

| #   | Method | URL                        | Request                                                                 | Expected | Actual | Result | Response summary                                                                                                                  |
| --- | ------ | -------------------------- | ----------------------------------------------------------------------- | -------: | -----: | ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| O1  | POST   | `/orders`                  | `{"items":[{"productId":2,"quantity":2},{"productId":3,"quantity":1}]}` |      201 |    201 | PASS   | Order **1**, `user.id=2`, `totalAmount` **5097.00** (expected 5097.00), 2 items                                                   |
| O2  | GET    | `/orders?page=1&limit=100` | –                                                                       |      200 |    200 | PASS   | Contains order 1, user 2, `itemCount` 2; pagination metadata present                                                              |
| O3  | GET    | `/orders/1`                | –                                                                       |      200 |    200 | PASS   | Wireless Mouse (MOU-001) ×2 @ 799.00 = 1598.00; Mechanical Keyboard (KEY-001) ×1 @ 3499.00 = 3499.00; total 5097.00               |
| O4  | GET    | `/orders/999999999`        | –                                                                       |      404 |    404 | PASS   | `NOT_FOUND`: "Order with id 999999999 not found"                                                                                  |
| O5  | POST   | `/orders`                  | `{"items":[{"productId":2,"quantity":1},{"productId":5,"quantity":4}]}` |      409 |    409 | PASS   | `INSUFFICIENT_STOCK`; detail: product 5, requested 4, available 3. No changes (see §5).                                           |
| O6  | POST   | `/orders`                  | `{"items":[]}`                                                          |      400 |    400 | PASS   | `VALIDATION_ERROR`: items: "Order must contain at least one item"                                                                 |
| O7  | POST   | `/orders`                  | `{"items":[{"quantity":1}]}`                                            |      400 |    400 | PASS   | items.0.productId: "productId must be a number"                                                                                   |
| O8  | POST   | `/orders`                  | `{"items":[{"productId":"abc","quantity":1}]}`                          |      400 |    400 | PASS   | items.0.productId: "productId must be a number"                                                                                   |
| O9  | POST   | `/orders`                  | `{"items":[{"productId":1,"quantity":0}]}`                              |      400 |    400 | PASS   | items.0.quantity: "quantity must be a positive integer"                                                                           |
| O10 | POST   | `/orders`                  | `{"items":[{"productId":1,"quantity":-1}]}`                             |      400 |    400 | PASS   | items.0.quantity: "quantity must be a positive integer"                                                                           |
| O11 | POST   | `/orders`                  | `{"items":[{"productId":1,"quantity":1.5}]}`                            |      400 |    400 | PASS   | items.0.quantity: "quantity must be an integer"                                                                                   |
| O12 | POST   | `/orders`                  | `{"items":[{"productId":1000005,"quantity":1}]}`                        |      404 |    404 | PASS   | `NOT_FOUND`: "Product(s) not found: 1000005". This is the API's established contract for unknown products.                        |
| O13 | POST   | `/orders`                  | `{}`                                                                    |      400 |    400 | PASS   | items: "items must be an array"                                                                                                   |
| O14 | POST   | `/orders`                  | Malformed JSON: `{"items": [`                                           |      400 |    400 | PASS   | `INVALID_JSON`                                                                                                                    |
| O15 | POST   | `/orders`                  | `{"items":[{"productId":2,"quantity":2},{"productId":2,"quantity":3}]}` |      201 |    201 | PASS   | Order **2**: the lines were **merged** into 1 item with quantity 5; total **3995.00** (5 × 799.00); 1 `order_items` row in the DB |

The ID used for the unknown product (O12) was computed as the database's highest product ID plus 1,000,000, so it can't exist.

### 3.4 Reports (STAFF)

| #   | Method | URL                                | Expected | Actual | Result | Response summary                                                                            |
| --- | ------ | ---------------------------------- | -------: | -----: | ------ | ------------------------------------------------------------------------------------------- |
| R1  | GET    | `/reports/low-stock?threshold=10`  |      200 |    200 | PASS   | HUB-001 (3), MON-001 (5). This matches the SQL query `stock < 10` exactly, including order. |
| R2  | GET    | `/reports/low-stock`               |      200 |    200 | PASS   | Default `threshold` is 10; count 2                                                          |
| R3  | GET    | `/reports/low-stock?threshold=0`   |      200 |    200 | PASS   | `data: []` (empty result)                                                                   |
| R4  | GET    | `/reports/low-stock?threshold=-1`  |      400 |    400 | PASS   | `VALIDATION_ERROR`: "threshold must be a non-negative integer"                              |
| R5  | GET    | `/reports/low-stock?threshold=abc` |      400 |    400 | PASS   | `VALIDATION_ERROR`                                                                          |

---

## 4. Stock before and after successful orders

| Product (id) | Unit price | Before O1 | After O1 (−2 / −1) | Before O15 | After O15 (−5) | Final | Expected net change | Result |
| ------------ | ---------: | --------: | -----------------: | ---------: | -------------: | ----: | ------------------: | ------ |
| LAP-001 (1)  |   50000.00 |        10 |                 10 |         10 |             10 |    10 |                   0 | PASS   |
| MOU-001 (2)  |     799.00 |        50 |             **48** |         48 |         **43** |    43 |                  −7 | PASS   |
| KEY-001 (3)  |    3499.00 |        25 |             **24** |         24 |             24 |    24 |                  −1 | PASS   |
| MON-001 (4)  |   18999.00 |         5 |                  5 |          5 |              5 |     5 |                   0 | PASS   |
| HUB-001 (5)  |    1499.00 |         3 |                  3 |          3 |              3 |     3 |                   0 | PASS   |

**Totals check:**

- Order 1: 2 × 799.00 + 1 × 3499.00 = **5097.00**. The API response, `orders.total_amount` and the sum of the `order_items` rows all agree.
- Order 2: 5 × 799.00 = **3995.00**.

---

## 5. Failed orders caused no changes

| Scenario                                                                                            | Check                                     | Before   | After     | Result                                     |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------- | --------- | ------------------------------------------ |
| **O5, insufficient stock** (a valid line for MOU-001 ×1, plus HUB-001 ×4 when only 3 were in stock) | MOU-001 stock                             | 48       | 48        | PASS. The valid line was **not** deducted. |
|                                                                                                     | HUB-001 stock                             | 3        | 3         | PASS                                       |
|                                                                                                     | `orders` / `order_items` rows             | 1 / 2    | 1 / 2     | PASS. No order and no partial items.       |
| **O6–O14, invalid orders** (9 requests)                                                             | Every product row (all columns)           | snapshot | identical | PASS                                       |
|                                                                                                     | `orders` / `order_items` rows             | 1 / 2    | 1 / 2     | PASS                                       |
| **P3–P5, forbidden product writes**                                                                 | Every product row, including `updated_at` | snapshot | identical | PASS                                       |
|                                                                                                     | Products with SKU `STAFF-TEST-…`          | –        | 0         | PASS                                       |

O5 deliberately mixed a valid line with a failing one. That proves the transaction rolls back atomically: the whole order is rejected, not just the failing line.

---

## 6. Database verification

All of these were checked with direct SQL against the Neon `public` schema.

| #   | Check                                                        | Result | Evidence                                                                     |
| --- | ------------------------------------------------------------ | ------ | ---------------------------------------------------------------------------- |
| D1  | Forbidden STAFF writes changed no products                   | PASS   | All 5 rows identical before and after P3–P5                                  |
| D2  | Invalid orders changed nothing                               | PASS   | Orders 1→1, items 2→2, product rows identical                                |
| D3  | STAFF user exists                                            | PASS   | `users.id=2`, `staff.testing@example.com`                                    |
| D4  | Role is STAFF                                                | PASS   | `role=STAFF`                                                                 |
| D5  | Password is hashed                                           | PASS   | `$2b$12$…`, 60 characters, not the plain text                                |
| D6  | Successful order belongs to the STAFF user                   | PASS   | `orders(1).user_id = 2`                                                      |
| D7  | Order items reference the correct products and quantities    | PASS   | MOU-001 (id 2) ×2, KEY-001 (id 3) ×1                                         |
| D8  | Price snapshot stored                                        | PASS   | `order_items.price` equals the product price at purchase: 799.00 and 3499.00 |
| D9  | Order total is correct                                       | PASS   | `total_amount=5097.00` equals the sum of the items                           |
| D10 | Final stock equals the baseline minus successful orders only | PASS   | See §4                                                                       |
| D11 | Seed products intact (name, SKU, price; none deleted)        | PASS   | 5 of 5 products, fields unchanged apart from the expected stock changes      |
| D12 | Existing ADMIN unaffected                                    | PASS   | Admin email, role, password hash and `updated_at` are identical              |
| D13 | Only the 2 successful orders were persisted                  | PASS   | Baseline 0 orders and 0 items; final 2 orders and 3 items                    |

**Records created by this session** (all intentional; nothing was deleted):

- User 2: `staff.testing@example.com` (STAFF)
- Order 1: total 5097.00, 2 items
- Order 2: total 3995.00, 1 item
- Stock changes: MOU-001 50→43 and KEY-001 25→24

Products 2 (MOU-001) and 3 (KEY-001) now appear in orders, so an ADMIN `DELETE` on them returns **409 `PRODUCT_IN_USE`**. That is the intended behaviour, which protects order history.

---

## 7. Bugs discovered

**None.** Every endpoint returned the expected status code and response shape, and the database state matched what the business rules require.

One environment note, which is not a bug in the API: the first attempt used port 5061. Node's `fetch` refuses to connect to that port because it's on the WHATWG list of blocked ports. No request reached the server, and the run was repeated on port 5080.

---

## 8. Not tested

None of the requested checks were skipped.

The following were outside this STAFF-focused run. Each is covered by the automated integration suite in the isolated test schema:

- Simultaneous orders racing for the same last unit.
- ADMIN-only product writes.

---

## 9. Automated regression suite

No application code was changed during this session. The existing automated suite was re-run afterwards against the isolated `inventory_test` schema, which doesn't touch the `public` data above.

**Result: 144 tests, 144 passed, 0 failed, 0 skipped.**
