# POS staging from zero (`medusa-platform`)

The short, start-to-finish setup of a POS **staging** project in Dokploy, built from the `medusa-platform` repo with the shared-core method: root pnpm workspace, Docker Context Path `.` (BUILD_PLAN.md §5.3, §7, §8.1). It's the same path as `ecommerce/STAGING_QUICKSTART.md`, with one more app (the till, `pos-app`) and the till checks. Do the parts in order; each ends with a **Check**.

The full runbook, [DOKPLOY_STAGING.md](./DOKPLOY_STAGING.md), has the background, the optional extras, the curl alternative for registers and cashiers, the independence test and troubleshooting.

**Never paste secret values** in chat, git or tickets. When you share a log, filter it first: `grep -v -i "secret\|access-key\|api_key"`.

---

## Part A: Prepare (10 min)

**A1. Repo access.** Dokploy already reads `medusa-platform` if you set up Ecommerce staging from it. Otherwise: GitHub → **Settings → Applications → Installed GitHub Apps** → your Dokploy app → **Configure** → **Repository access** → add `medusa-platform`.

**A2. Three hostnames**, each an **A record** to the Dokploy server:
- `<api host>`: backend and admin (e.g. `pos-api.yourdomain`)
- `<shop host>`: online shop (e.g. `pos-shop.yourdomain`)
- `<till host>`: till app (e.g. `pos.yourdomain`)

Reusing the old POS staging hostnames is fine; you move them over in Part G.

**A3. Six secrets.** Run `openssl rand -hex 32` six times and keep them in your password manager:

| Name | Used as | On |
|---|---|---|
| A | `JWT_SECRET` | backend, worker |
| B | `COOKIE_SECRET` | backend, worker |
| C | `AUTH_MFA_ENCRYPTION_KEY` (never change it later) | backend, worker |
| D | `REVALIDATE_SECRET` | backend, worker, storefront |
| E | `SHOPPER_IP_SECRET` | backend, worker, storefront, till |
| F | the till's own `COOKIE_SECRET` (not B) | till |

S3, Resend, Telegram and PayWay are optional for POS staging: every POS check works without them. If you add them, use POS's own bucket and Telegram group, not Ecommerce's (runbook Step 0.C).

**Check:** `medusa-platform` is in a Dokploy app's Repository dropdown; you have three hostnames and six secrets.

---

## Part B: Project and databases (5 min)

1. Dokploy → **Projects** → **Create Project** → a name no other project uses (e.g. `pos-stg`).
2. **Create Service → Database → Postgres**: name `pos-postgres`, Database Name `pos` → **Create** → **Deploy**. Copy its **Internal Connection URL**. Leave External Credentials **off**.
3. **Create Service → Database → Redis**: name `pos-redis` → **Deploy**. Copy its **Internal Connection URL**.

**Check:** both services are green.

---

## Part C: Backend server `pos-backend` (15 min)

1. **Create Service → Application** → `pos-backend`.
2. **Provider: GitHub**: Repository `medusa-platform`, Branch `main`, Build Path `/`, Trigger On Push → **Save**.
3. **Build Type**: Dockerfile, Docker File `pos/backend/Dockerfile`, Docker Context Path `.`, Build Stage empty → **Save**.
4. **Watch Paths**, one per line:
   ```
   pos/backend/**
   packages/medusa-core/**
   pnpm-workspace.yaml
   package.json
   pnpm-lock.yaml
   ```
5. **Environment Variables** (fill every `<…>`):
   ```
   NODE_ENV=production
   PORT=9000
   DATABASE_URL=<Postgres Internal Connection URL>
   DATABASE_SSL=false
   REDIS_URL=<Redis Internal Connection URL>
   MEDUSA_FF_CACHING=true
   JWT_SECRET=<A>
   COOKIE_SECRET=<B>
   AUTH_MFA_ENCRYPTION_KEY=<C>
   STORE_CORS=https://<shop host>
   ADMIN_CORS=https://<api host>
   AUTH_CORS=https://<api host>,https://<shop host>,https://<till host>
   POS_CORS=https://<till host>
   MEDUSA_BACKEND_URL=
   DISABLE_MEDUSA_ADMIN=false
   MEDUSA_WORKER_MODE=server
   RUN_MIGRATIONS=true
   STOREFRONT_URL=https://<shop host>
   REVALIDATE_SECRET=<D>
   SHOPPER_IP_SECRET=<E>
   CLIENT_IP_HEADER=
   ```
   `DATABASE_URL` must start with `postgres`, `REDIS_URL` with `redis` (F-012). Optional extras: runbook Step 2.B.
6. **Domains → Add Domain**: `<api host>`, Path `/`, Container Port **9000**, HTTPS on.
7. **Swarm Settings:**
   - **Health Check:** exactly two boxes: `CMD-SHELL` and `node -e "fetch('http://localhost:9000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`. Interval `30000000000`, Timeout `10000000000`, Start Period `120000000000`, Retries `3`.
   - **Update Config:** Parallelism `1`, Delay `10000000000`, Failure Action **Rollback**, Monitor `10000000000`, Max Failure Ratio `0`, Order **Start First**. The dropdowns may show "Select…" after saving; the values are stored (F-020).
   - **Replicas:** `1`.
8. **Deploy** (about 5–10 minutes).

**Check:** `https://<api host>/health` shows `OK`. If you're reusing hostnames that another project still serves, use a **Generated** domain until Part G.

---

## Part D: Admin, data, store currency, key (10 min)

1. `pos-backend` → **Terminal**:
   ```bash
   docker-entrypoint.sh medusa user -e <your-email> -p '<a strong password>'
   docker-entrypoint.sh medusa exec ./src/scripts/seed-initial-data.js
   docker-entrypoint.sh medusa exec ./src/scripts/seed.js
   ```
   The first adds the demo products; the second adds the Cambodia region (USD), the **Phnom Penh** stock location and delivery.
2. Admin `/app` → **Settings → Store**: **Default currency USD**, **Default region Cambodia** (the till opens shifts in the store's currency, F-086).
3. **Settings → Publishable API Keys** → the one key → it must list exactly **one** sales channel, **Default Sales Channel** → copy its `pk_…` token.

**Check:** you can sign in, Products lists the demo products, the store currency is USD.

---

## Part E: Worker `pos-worker` (5 min)

1. **Create Service → Application** → `pos-worker`.
2. Provider and Build Type as C2 and C3 (Docker File `pos/backend/Dockerfile`, Context Path `.`); Watch Paths as C4.
3. **Environment:** the backend's whole block, with three lines changed:
   ```
   MEDUSA_WORKER_MODE=worker
   DISABLE_MEDUSA_ADMIN=true
   RUN_MIGRATIONS=false
   ```
4. **No domain, no health check.** Update Config as the backend's, Order **Stop First**.
5. **Deploy** after the backend is healthy.

**Check:** Logs show `Starting Medusa (worker mode: worker)` and `Server is ready`, no errors.

---

## Part F: Online shop `pos-storefront` and till `pos-pos-app` (15 min)

**F1. `pos-storefront`**
1. **Create Service → Application** → `pos-storefront`. Provider as C2. Build Type: Docker File `pos/storefront/Dockerfile`, Context Path `.`.
2. Watch Paths: `pos/storefront/**`, `pnpm-workspace.yaml`, `package.json`, `pnpm-lock.yaml`.
3. **Build-time Arguments:**
   ```
   NEXT_PUBLIC_MEDUSA_BACKEND_URL=https://<api host>
   NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=<pk_… from Part D>
   NEXT_PUBLIC_BASE_URL=https://<shop host>
   NEXT_PUBLIC_DEFAULT_REGION=kh
   NEXT_PUBLIC_STRIPE_KEY=
   NEXT_PUBLIC_CAPTCHA_PROVIDER=
   NEXT_PUBLIC_CAPTCHA_SITE_KEY=
   S3_IMAGE_HOSTNAME=
   S3_IMAGE_PATHNAME=/**
   ```
4. **Environment Variables:**
   ```
   NODE_ENV=production
   PORT=8000
   MEDUSA_BACKEND_URL=https://<api host>
   REVALIDATE_SECRET=<D>
   SHOPPER_IP_SECRET=<E>
   CLIENT_IP_HEADER=
   ```
5. **Swarm:** Health Check two boxes, `CMD-SHELL` and `node -e "fetch('http://localhost:8000/favicon.ico').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`, Start Period `60000000000` (other values as the backend); Update Config as the backend.

**F2. `pos-pos-app`** (the till)
1. **Create Service → Application** → `pos-pos-app`. Provider as C2. Build Type: Docker File `pos/pos-app/Dockerfile`, Context Path `.`.
2. Watch Paths: `pos/pos-app/**`, `pnpm-workspace.yaml`, `package.json`, `pnpm-lock.yaml`.
3. **Build-time Arguments:** none (leave the box empty). **Environment Variables** (the runtime box: the till's server reads these while it runs; values put under Build-time Arguments are empty in the running container):
   ```
   NODE_ENV=production
   PORT=3000
   MEDUSA_BACKEND_URL=https://<api host>
   COOKIE_SECRET=<F>
   SHOPPER_IP_SECRET=<E>
   ```
   After the deploy, check in `pos-pos-app` → **Terminal** that the till reaches the backend:
   ```bash
   node -e "fetch(process.env.MEDUSA_BACKEND_URL+'/health').then(r=>r.text()).then(t=>console.log('OK',t)).catch(e=>console.log('ERR',e.cause?.code||e.message))"
   ```
   It must print `OK OK`. `ERR ERR_INVALID_URL` means `MEDUSA_BACKEND_URL` is missing: the till then answers "fetch failed" at sign-in. Put it under **Environment Variables**, **Save**, **Redeploy**.
4. **Swarm:** Health Check two boxes, `CMD-SHELL` and `node -e "fetch('http://localhost:3000/manifest.webmanifest').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`, Start Period `60000000000`; Update Config as the backend.

Don't deploy either yet if their hostnames still belong to another project: Part G moves them first.

**Check:** both apps saved.

---

## Part G: Domains and go live (10 min)

1. If the hostnames belong to an older project, remove them from its apps' **Domains**, and **stop** those apps (keep them as the way back until Part H passes).
2. Add the domains: `pos-backend` `<api host>` → port **9000** (if not done in C6); `pos-storefront` `<shop host>` → port **8000**; `pos-pos-app` `<till host>` → port **3000**; HTTPS on.
3. **Redeploy** `pos-backend`, then **Deploy** `pos-storefront` and `pos-pos-app`.

**Check:**

| Check | Pass |
|---|---|
| `https://<api host>/health` | `OK` |
| `https://<api host>/app/` | the admin |
| `https://<shop host>/` | redirects to `/kh`, shows the demo products |
| `https://<till host>/` | redirects to `/login`: **POS counter**, "Sign in to open the till." |
| `https://<till host>/manifest.webmanifest` | 200 |
| server: `docker ps --filter name=pos- --format '{{.Names}} {{.Status}}'` | backend, storefront, till `(healthy)`, worker `Up` |

---

## Part H: The real test (15 min)

1. **Stock:** Admin → **Inventory** → `SHIRT-L-BLACK` → location **Phnom Penh**, **In stock 10** → Save.
2. **Register:** Admin → **Registers** → Name `Front till`, Code `PP-1`, Stock location `Phnom Penh`, Sales channel `Default Sales Channel` → **Add register**.
3. **Cashier:** Admin → **Cashiers** → a name and an email you can type at the till → **Invite**. Note the **invite code**.
4. **Till:** `https://<till host>/login` → **First time? Set your password** → the cashier email, a password (8+ characters, twice) and the invite code → choose *Front till* → opening cash `20` → **Open shift**.
5. **Sale:** scan or type `SHIRT-L-BLACK`, quantity **2**, **Cash**, cash received ≥ the total → **Complete sale**. Note the **order number**; **Print receipt** (PDF is fine).
6. **Close shift:** cash counted = 20 + the sale's total → variance **0.00**. Admin → **Shift report** shows the same.
7. **Stock:** `SHIRT-L-BLACK` at Phnom Penh now shows **8**: the till took stock from its own location only.
8. **Auto-deploy:** the next merge that touches POS's watched files (e.g. SC-2's PayWay move, or a root `pnpm-workspace.yaml` change) starts the POS deployments by itself.

**Check:** a sale with an order number, shift variance 0, stock 10 → 8.

---

## Afterwards

- **Each app redeployed alone** (independence): runbook Step 9.
- **Troubleshooting:** runbook Step 10.
- **Results** go into `docs/TASKS.md` → SC-1 (pos); then SC-1 for POS is ticked and the old POS staging project can be deleted.
