# Ecommerce staging from zero (`medusa-platform`)

The short, start-to-finish setup of an Ecommerce **staging** project in Dokploy, built from the `medusa-platform` repo with the shared-core method: root pnpm workspace, Docker Context Path `.` (BUILD_PLAN.md §5.3, §7, §8.1). Do the parts in order; each ends with a **Check**.

The full runbook, [DOKPLOY_STAGING.md](./DOKPLOY_STAGING.md), has the background, every optional variable, backups, alerts, rollback tests and the production go-live. This page is the path to a working staging.

**Never paste secret values** in chat, git or tickets. When you share a log, filter it first: `grep -v -i "secret\|access-key\|api_key"`.

---

## Part A: Prepare (10 min)

**A1. Give Dokploy access to the repo.** GitHub → **Settings → Applications → Installed GitHub Apps** → your Dokploy app → **Configure** → **Repository access** → add **`medusa-platform`** → **Save**.

**A2. Pick the two hostnames.**
- `<api host>` = the backend (e.g. `api-staging.yourdomain`), `<shop host>` = the shop (e.g. `shop-staging.yourdomain`), each an **A record** to the Dokploy server.
- Reusing hostnames that ABA PayWay already whitelisted avoids a new whitelisting request; you move them over in Part G.

**A3. Values.**
- Generate on your own machine and keep in your password manager:
  ```bash
  openssl rand -base64 32   # JWT_SECRET
  openssl rand -base64 32   # COOKIE_SECRET
  openssl rand -hex 32      # AUTH_MFA_ENCRYPTION_KEY (never change it once used)
  openssl rand -hex 32      # REVALIDATE_SECRET (backend, worker, storefront)
  openssl rand -hex 32      # SHOPPER_IP_SECRET (backend, storefront)
  ```
- From an existing staging project (or your accounts): the S3 keys, Resend, Telegram, PayWay and CAPTCHA values. Their meaning is in `ecommerce/backend/.env.example`.

**Check:** `medusa-platform` appears in a Dokploy app's **Provider: GitHub → Repository** dropdown; you have both hostnames and all values.

---

## Part B: Project and databases (5 min)

1. Dokploy → **Projects** → **Create Project** → a name used by no other project (e.g. `ecommerce-stg`).
2. **Create Service → Database → Postgres**: name `ecommerce-postgres`, Database Name `ecommerce` → **Create** → **Deploy**. Copy its **Internal Connection URL**. Leave **External Credentials off** (it would open port 5432 to the internet).
3. **Create Service → Database → Redis**: name `ecommerce-redis` → **Deploy**. Copy its **Internal Connection URL**.

**Check:** both services are green.

---

## Part C: Backend server `ecommerce-backend` (15 min)

1. **Create Service → Application** → name `ecommerce-backend`.
2. **General → Provider: GitHub** → **Save**:

   | Field | Value |
   |---|---|
   | Repository | `medusa-platform` |
   | Branch | `main` |
   | Build Path | `/` |
   | Trigger Type | On Push |

3. **General → Build Type** → **Save**:

   | Field | Value |
   |---|---|
   | Build Type | Dockerfile |
   | Docker File | `ecommerce/backend/Dockerfile` |
   | Docker Context Path | `.` (the repo root) |
   | Docker Build Stage | empty |

4. **Watch Paths**, one per line → **Save**:
   ```
   ecommerce/backend/**
   pnpm-workspace.yaml
   package.json
   pnpm-lock.yaml
   ```
5. **Environment → Environment Variables.** Fill every `<…>`, then add the feature values from A3 at the bottom:
   ```
   NODE_ENV=production
   PORT=9000
   DATABASE_URL=<Postgres Internal Connection URL>
   DATABASE_SSL=false
   REDIS_URL=<Redis Internal Connection URL>
   MEDUSA_FF_CACHING=true
   JWT_SECRET=<generated>
   COOKIE_SECRET=<generated>
   AUTH_MFA_ENCRYPTION_KEY=<generated>
   STORE_CORS=https://<shop host>
   ADMIN_CORS=https://<api host>
   AUTH_CORS=https://<api host>,https://<shop host>
   MEDUSA_BACKEND_URL=
   MEDUSA_WORKER_MODE=server
   DISABLE_MEDUSA_ADMIN=false
   RUN_MIGRATIONS=true
   STOREFRONT_URL=https://<shop host>
   REVALIDATE_SECRET=<generated>
   SHOPPER_IP_SECRET=<generated>
   PAYWAY_RETURN_URL=https://<api host>/hooks/payment/payway_payway
   # + S3_*, RESEND_*, TELEGRAM_*, PAYWAY_MERCHANT_ID, PAYWAY_API_KEY,
   #   PAYWAY_API_URL (empty = sandbox), PAYWAY_RSA_PUBLIC_KEY, CAPTCHA_*
   ```
   `DATABASE_URL` must be the **Postgres** URL and `REDIS_URL` the **Redis** one; swapping them makes migrations hang and the domain shows Bad Gateway (F-012). `PAYWAY_RSA_PUBLIC_KEY` goes on **one line** (DOKPLOY_STAGING.md §2.5 has the PayWay notes).
6. **Advanced → Swarm Settings:**
   - **Health Check:** **Test Commands** gets exactly **two** boxes:
     1. `CMD-SHELL`
     2. `node -e "fetch('http://localhost:9000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`

     Interval `30000000000`, Timeout `10000000000`, Start Period `120000000000`, Retries `3` → **Save**. Never paste a JSON array into one box (F-021).
   - **Update Config:** Parallelism `1`, Delay `10000000000`, Failure Action **Rollback**, Monitor `10000000000`, Max Failure Ratio `0`, Order **Start First** → **Save**. The dropdowns may show blank after saving; the values are stored (F-020).
   - **Replicas:** `1`.
7. **Deploy.** The first build takes about 5–10 minutes.

**Check:** the deployment shows **Done**. If it shows **Error**, open it and keep its last log lines (filtered).

---

## Part D: Admin, shop data and key (5 min)

1. `ecommerce-backend` → **Domains** → **Generate** (a temporary Dokploy domain until Part G).
2. `ecommerce-backend` → **Terminal**:
   ```bash
   docker-entrypoint.sh medusa user -e <your-email> -p <a-strong-password>
   docker-entrypoint.sh medusa exec ./src/scripts/seed.js
   docker-entrypoint.sh medusa exec ./src/scripts/seed-initial-data.js
   ```
   - `seed.js`: the Cambodia region (USD checkout, KHR as a second currency), Phnom Penh stock location and delivery option. Safe to re-run.
   - `seed-initial-data.js`: 4 demo products for testing.
3. Open `https://<generated api host>/app`, sign in → **Settings → Publishable API Keys** → copy the `pk_…` token.

**Check:** you can sign in to the admin, and **Products** lists the seeded products.

---

## Part E: Worker `ecommerce-worker` (5 min)

1. **Create Service → Application** → `ecommerce-worker`.
2. **Provider** and **Build Type** as C2 and C3 (Docker File `ecommerce/backend/Dockerfile`, Context Path `.`).
3. **Watch Paths:** the same four as the backend.
4. **Environment:** the backend's whole block, with three lines changed:
   ```
   MEDUSA_WORKER_MODE=worker
   DISABLE_MEDUSA_ADMIN=true
   RUN_MIGRATIONS=false
   ```
   The worker needs all the feature values too: it sends the emails and Telegram messages and handles PayWay's callback.
5. **Swarm:** **no** domain and **no** health check. Update Config as the backend's, with Order **Stop First**.
6. **Deploy**, after the backend is healthy.

**Check:** **Logs** show `Starting Medusa (worker mode: worker)` and `Server is ready`, with no errors.

---

## Part F: Storefront `ecommerce-storefront` (10 min)

1. **Create Service → Application** → `ecommerce-storefront`.
2. **Provider** as C2. **Build Type:** Docker File `ecommerce/storefront/Dockerfile`, Context Path `.`.
3. **Watch Paths:**
   ```
   ecommerce/storefront/**
   pnpm-workspace.yaml
   package.json
   pnpm-lock.yaml
   ```
4. **Environment → Build-time Arguments** (baked into the bundle; changing one means a redeploy):
   ```
   NEXT_PUBLIC_MEDUSA_BACKEND_URL=https://<api host>
   NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=<pk_… from Part D>
   NEXT_PUBLIC_BASE_URL=https://<shop host>
   NEXT_PUBLIC_DEFAULT_REGION=kh
   NEXT_PUBLIC_STRIPE_KEY=
   NEXT_PUBLIC_CAPTCHA_PROVIDER=<same as the backend's CAPTCHA_PROVIDER, or empty>
   NEXT_PUBLIC_CAPTCHA_SITE_KEY=<site key, or empty>
   S3_IMAGE_HOSTNAME=<host part of S3_FILE_URL>
   S3_IMAGE_PATHNAME=/**
   ```
5. **Environment → Environment Variables** (runtime):
   ```
   NODE_ENV=production
   PORT=8000
   MEDUSA_BACKEND_URL=https://<api host>
   REVALIDATE_SECRET=<same as the backend>
   SHOPPER_IP_SECRET=<same as the backend>
   ```
6. **Swarm Settings:**
   - **Health Check:** two boxes, `CMD-SHELL` and `node -e "fetch('http://localhost:8000/favicon.ico').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`; Interval `30000000000`, Timeout `10000000000`, Start Period `60000000000`, Retries `3`.
   - **Update Config:** as the backend (Start First, Rollback).
7. **Don't deploy yet:** the build bakes in `<api host>`, which answers only after Part G.

**Check:** all fields saved, no deployment started.

---

## Part G: Domains and go live (10 min)

1. If the hostnames belong to another (older) project, remove them from its apps' **Domains** first.
2. `ecommerce-backend` → **Domains → Add**: Host `<api host>`, Path `/`, Container Port **9000**, HTTPS on.
3. `ecommerce-storefront` → **Domains → Add**: Host `<shop host>`, Path `/`, Container Port **8000**, HTTPS on.
4. **Redeploy** `ecommerce-backend`, then **Deploy** `ecommerce-storefront`.
5. Stop (don't delete yet) any older staging apps that served these hostnames: they are the way back.

**Check:**

| Check | Pass |
|---|---|
| `https://<api host>/health` | `OK` (200) |
| `https://<api host>/app/` | the admin (200) |
| `curl -s -H "x-publishable-api-key: <pk_…>" "https://<api host>/store/products?fields=handle"` | `"count"` above 0 (F-017) |
| `https://<shop host>/` | redirects to `/kh` and shows the store |
| storefront terminal: `grep -oE 'https?://[A-Za-z0-9._:-]+' /app/.next/server/src/middleware.js \| sort -u` | prints `https://<api host>` (F-016) |
| `curl -s -o /dev/null -w '%{http_code}' -X POST https://<shop host>/api/revalidate` | `401` (the cache refresh route wants its secret) |

---

## Part H: The real test (10 min)

1. In the shop: a product → **Add to cart** → **Checkout** with a Cambodian phone number and Phnom Penh delivery → **Pay with PayWay** using ABA's sandbox test cards.
2. In the admin the order shows as **Captured**.
3. The staff Telegram group gets the new-order alert, and the order email arrives.
4. Merge any small PR into `medusa-platform`: `ecommerce-backend` → **Deployments** starts a new deployment by itself. That proves staging follows the repo.

**Check:** one paid order, Captured, alert and email received, and an automatic deployment seen.

---

## Afterwards

- **Backups, alerts, rollback test:** DOKPLOY_STAGING.md §6 (each app redeployed alone, automatic rollback), §7 (daily database backups and a restore test), §9 (the smoke test after every deploy) and §9.5 (Dokploy Telegram alerts).
- **Production:** a separate project from `release/ecommerce`, moved only by the owner (BUILD_PLAN.md §8.1, §8.2, D14, D15).
- **Results** go into `docs/TASKS.md` → SC-1 (ecommerce).
