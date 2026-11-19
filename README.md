# Inventory & Order Management

A full-stack inventory and order management system: a transaction-safe REST API with a React admin dashboard on top.

```
.
├── backend/     Node.js · Express 5 · TypeScript · Prisma 7 · Neon PostgreSQL (REST API)
├── frontend/    React · Vite (admin and staff dashboards)
└── render.yaml  Render Blueprint that deploys both
```

| Part     | Documentation                            | Local URL               |
| -------- | ---------------------------------------- | ----------------------- |
| Backend  | [backend/README.md](backend/README.md)   | `http://localhost:5000` |
| Frontend | [frontend/README.md](frontend/README.md) | `http://localhost:5173` |

## Run locally

```bash
# 1. API
cd backend
npm install
cp .env.example .env          # add your Neon URLs, JWT secret and admin credentials
npm run db:migrate:deploy     # create the tables (safe to re-run)
npm run db:seed               # create the admin account and sample products
npm run dev

# 2. Dashboard (in a second terminal)
cd frontend
npm install
cp .env.example .env          # VITE_API_BASE_URL=http://localhost:5000
npm run dev
```

Sign in with the `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `backend/.env`.

## Deploy to Render (Blueprint)

`render.yaml` creates two services from this repository:

| Service             | Type        | Root directory | Live URL                                      |
| ------------------- | ----------- | -------------- | --------------------------------------------- |
| `inventory-hub-api` | Web service | `backend/`     | `https://inventory-hub-api-v8xx.onrender.com` |
| `inventory-hub-web` | Static site | `frontend/`    | `https://inventory-hub-web-v8xx.onrender.com` |

1. Push this repository to GitHub.
2. In Render, choose **New → Blueprint**, pick the repository and branch, and click **Apply**.
3. When Render asks for the secret values, enter:
   - `DATABASE_URL`: the Neon **pooled** connection string (host contains `-pooler`)
   - `DIRECT_URL`: the Neon **direct** connection string
   - `ADMIN_EMAIL` and `ADMIN_PASSWORD`: the admin account to seed

   `JWT_SECRET` is generated automatically. Database migrations run during the backend build and are non-destructive.

4. After the first backend deploy, open **inventory-hub-api → Shell** and run `npm run db:seed` once to create the admin account. Skip this if your Neon database already has the admin from an earlier deploy.
5. Open the `inventory-hub-web` URL and sign in.

**If Render gives the API a different URL** (for example `inventory-hub-api-abcd.onrender.com`, which happens when the name is already taken):

1. Open **inventory-hub-web → Environment**.
2. Set `VITE_API_BASE_URL` to the API's actual URL.
3. Choose **Manual Deploy → Clear build cache & deploy**.

Vite reads this value at build time, so the frontend must be rebuilt.

**Free plan:** services sleep when idle, so the first request after a pause can take up to about a minute. The dashboard retries read-only requests once while the API wakes up.
