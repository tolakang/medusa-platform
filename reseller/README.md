# Reseller — `reseller/`

> **Sellers sell your products; you ship.** Phase 5 code done (2026-11-11, P5-01 to P5-10); the exit checklist (P5-11, with a staging run of all three apps) waits for the owner. Scope: [BUILD_PLAN.md §9.5](../BUILD_PLAN.md).
>
> `backend/` and `storefront/` are a **full copy of Ecommerce** (PayWay, Resend, Telegram, Cambodia rules; TASKS F-061), on Medusa 2.22.6; see [backend/README.md](backend/README.md) and [storefront/README.md](storefront/README.md). Seller features: P5-01 to P5-07 (backend README). `seller-portal/` is the seller portal (P5-08; [seller-portal/README.md](seller-portal/README.md)): sign-in for invited sellers, product choice, sales and commissions. Local stack: `docker-compose.local.yml`.

This folder is **one complete category**. Copy the whole folder's setup into one Dokploy project and every piece deploys on its own.

```
reseller/
├── README.md                <- this guide
├── backend/                 Medusa server + worker
│   ├── Dockerfile
│   ├── docker-entrypoint.sh
│   └── .env.example
├── storefront/              customer storefront
│   ├── Dockerfile
│   └── .env.example
└── seller-portal/           seller portal
    ├── Dockerfile
    └── .env.example
```

## Dokploy project: `reseller`

| Service | Type | Build Path | Port → example domain | Env source |
|---|---|---|---|---|
| `reseller-postgres` | Dokploy **PostgreSQL** | — | — | database `reseller` |
| `reseller-redis` | Dokploy **Redis** | — | — | — |
| `reseller-backend` | Application (Dockerfile) | `/reseller/backend` | 9000 → `api.example.com` | `backend/.env.example`, `MEDUSA_WORKER_MODE=server`, `ORDER_ACCESS_SECRET` (= the storefront's) |
| `reseller-worker` | Application (Dockerfile) | `/reseller/backend` | none | same env + worker overrides |
| `reseller-storefront` | Application (Dockerfile) | `/reseller/storefront` | 8000 → `shop.example.com` | `storefront/.env.example` (build args + runtime); runtime `ORDER_ACCESS_SECRET` (`openssl rand -hex 32`, same value as the backend: guest order details, `packages/medusa-core/src/api/order-access.ts`) |
| `reseller-seller-portal` | Application (Dockerfile) | `/reseller/seller-portal` | 3000 → `sellers.example.com` | `seller-portal/.env.example` (runtime; build args optional) |

Every application uses **Build Type: Dockerfile** with **Build Path `/`**, **Docker File** `reseller/<app>/Dockerfile` and **Docker Context Path** `.` (the repo root, since SC-1: the apps are in the root pnpm workspace; paths relative to the repo root, F-011), and **watch paths** `reseller/<app>/**` plus the root `pnpm-workspace.yaml`, `package.json`, `pnpm-lock.yaml`, so a change to one app never redeploys another; a Medusa catalog change redeploys all of them. The "Build Path" column above is the app folder, not the Dokploy Build Path field.

### Shared core and release branches (plan §4–§5)

**Build from the repo root.** Reseller moved in its SC-1 PR (`docs/TASKS.md` → *Shared core*). For each app (`backend`, `storefront`, `seller-portal`) and the worker, in Dokploy:
- **Repository:** `medusa-platform` (General → Provider: GitHub; Branch `main`). Projects created for the old `medusa-apps` repo get no changes from this repo until this is switched; if the repo isn't in the dropdown, give the Dokploy GitHub App access to it first (GitHub → Settings → Applications → Installed GitHub Apps → Configure → Repository access).
- **Docker File:** `reseller/<app>/Dockerfile` (unchanged).
- **Docker Context Path:** `.` (the repo root) instead of `reseller/<app>`.
- **Watch Paths:** `reseller/<app>/**` (the worker: `reseller/backend/**`) plus `pnpm-workspace.yaml`, `package.json`, `pnpm-lock.yaml` (the root files of the workspace). Since SC-2 (PayWay moved into the core) the backend and the worker also watch `packages/medusa-core/**`.
- **When to switch:** once that app's SC-1 PR is green, change these fields and save **without** redeploying; then the PR merges and staging builds with the new fields. If a build fails, set the fields back and redeploy: the old image keeps running until then.

**Staging and production branches** (SC-3, before this category's first production deploy):
- **Staging** apps keep **Branch `main`**: every merge redeploys the changed apps.
- **Production** apps use **Branch `release/reseller`**, Trigger **On Push**. Only you move it; Claude never does.
- **Release** (after checking staging), from your own terminal:
  ```bash
  git fetch origin && git push origin origin/main:refs/heads/release/reseller
  ```
  To release an older checked commit instead, put its hash in place of `origin/main`.
- **Release order** (plan §8.2, D15): a change that reaches several categories (Medusa, pnpm, Node, the core) goes to production Ecommerce → POS → the other four, one at a time, the next after 24 hours of a clean run.
- **Optional record:** tag each release too, e.g. `git tag reseller-<yyyy-mm-dd> origin/release/reseller && git push origin reseller-<yyyy-mm-dd>`. Dokploy still follows the branch; the tag is only a readable history.
- **Rollback:** move the branch back to the previous release, then run any `db:rollback` the release notes need (plan §8.2):
  ```bash
  git push --force origin <previous commit>:refs/heads/release/reseller
  ```
  The previous commit is in the production app's **Deployments** tab, or in `git log origin/release/reseller`.
- **GitHub protection** (once, SC-3): **Settings → Rules → Rulesets → New branch ruleset**, target `release/*`, turn on **Restrict updates**, **Restrict deletions** and **Block force pushes**, and add yourself to the **bypass list**, so only you can release and roll back.

## Deploy order (first time)

1. Create `reseller-postgres` and `reseller-redis`.
2. Deploy `reseller-backend` (server). Migrations run on start. Check `https://api.example.com/health`.
3. Create the first admin user from the backend's Dokploy terminal:
   `docker-entrypoint.sh medusa user -e you@example.com -p <password>`
4. In the same terminal, run the Cambodia seed: `docker-entrypoint.sh medusa exec ./src/scripts/seed.js`. It sets the store to USD (default) + KHR and adds the Cambodia region, the Phnom Penh stock location and delivery, on Medusa's first-boot **Default Sales Channel**. Then in the admin: **Settings → Publishable API Keys** → the one key must list exactly that one channel → copy its `pk_…`. (The optional demo `seed-initial-data.js` keeps the default currency since F-101; on an older staging that ran it, set USD as default and add KHR back in **Settings → Store**.)
5. Deploy `reseller-worker` (same Build Path, worker overrides).
6. Put the publishable key and backend URL into the storefront's **Build-time Arguments**, then deploy `reseller-storefront`.
7. Deploy `reseller-seller-portal` with runtime `COOKIE_SECRET` (its own, `openssl rand -hex 32`), `MEDUSA_BACKEND_URL` and `SHOPPER_IP_SECRET` (the backend's); no build args needed.
8. Set the final domains in the backend CORS variables (`SELLER_CORS` = the portal's origin, also added to `AUTH_CORS`), set `SELLER_PORTAL_URL` to the portal's URL, and redeploy the backend and the worker (the worker sends the emails).

After the first deploy, every service can be redeployed, rebuilt or rolled back **independently**.

## How the pieces connect

- All clients reach the backend only over HTTP. No shared code, no shared files, no shared build.
- Backend CORS must list each client domain:
  - `STORE_CORS` = storefront domain
  - `ADMIN_CORS` = backend/admin domain
  - `AUTH_CORS` = every domain where someone logs in
  - `SELLER_CORS` = seller portal domain (custom `/sellers/*` routes); the portal's origin also goes in `AUTH_CORS`
- `SELLER_PORTAL_URL` = the portal's public URL, for the links in seller emails; empty = the first `SELLER_CORS` origin.
- The storefront reaches the backend through the public `NEXT_PUBLIC_MEDUSA_BACKEND_URL` (build-time). Runtime `MEDUSA_BACKEND_URL` can be the backend's **internal** Dokploy hostname once starter change 6 in BUILD_PLAN.md §7.2 is applied (faster, private; copy the exact name Dokploy shows for the service, it may carry a suffix). Build-time URLs must be **public**, because the build runs on the build server.
- `NEXT_PUBLIC_*` values are baked in at build time. Changing one = rebuild that client.

## Independence rules

- Shared backend code comes only from `packages/medusa-core` (plan §4–§5); this category's own code stays here, and its clients never use the core.
- This project has its **own** Postgres and Redis. Never point two businesses at the same database.
- A second business of the same type = a second Dokploy project built from the same folder, with its own env.
- To add another category's features to this business (e.g. POS for a marketplace), add that module to **this** backend; do not deploy a second backend.
