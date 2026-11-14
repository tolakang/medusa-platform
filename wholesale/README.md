# Wholesale — `wholesale/`

> **Sellers buy your products in bulk (B2B).** Phase 4, in progress (started 2026-11-10): backend (P4-01 to P4-07) and storefront (P4-08) built and checked end to end in the local Podman stack (P4-10); open: P4-11 to P4-13. Scope: [BUILD_PLAN.md §9.4](../BUILD_PLAN.md).
>
> `backend/` has app code: the official `b2b-starter` backend (companies, employees, quotes, approvals) on Medusa 2.22.6, see [backend/README.md](backend/README.md) (TASKS P4-01). `storefront/` is the `b2b-starter` storefront, a buyer shop behind sign-in with quick order by SKU / CSV, reorder, invoices, quotes and company users, see [storefront/README.md](storefront/README.md) (TASKS P4-08).

This folder is **one complete category**. Copy the whole folder's setup into one Dokploy project and every piece deploys on its own.

```
wholesale/
├── README.md                <- this guide
├── backend/                 Medusa server + worker (from b2b-starter; README.md lists the changes)
│   ├── Dockerfile
│   ├── docker-entrypoint.sh
│   ├── .env.example
│   └── src/                 modules company, quote, approval, invoice
├── storefront/              B2B buyer shop (from b2b-starter; README.md lists the changes)
│   ├── Dockerfile
│   ├── .env.example
│   └── src/
└── docker-compose.local.yml local stack (Dokploy ignores it)
```

## Dokploy project: `wholesale`

| Service | Type | Build Path | Port → example domain | Env source |
|---|---|---|---|---|
| `wholesale-postgres` | Dokploy **PostgreSQL** | — | — | database `wholesale` |
| `wholesale-redis` | Dokploy **Redis** | — | — | — |
| `wholesale-backend` | Application (Dockerfile) | `/wholesale/backend` | 9000 → `api.example.com` | `backend/.env.example`, `MEDUSA_WORKER_MODE=server` |
| `wholesale-worker` | Application (Dockerfile) | `/wholesale/backend` | none | same env + worker overrides |
| `wholesale-storefront` | Application (Dockerfile) | `/wholesale/storefront` | 8000 → `shop.example.com` | `storefront/.env.example` (build args + runtime) |

Every application uses **Build Type: Dockerfile** with **Build Path `/`**, **Docker File** `wholesale/<app>/Dockerfile` and **Docker Context Path** `.` (the repo root, since SC-1: the apps are in the root pnpm workspace; paths relative to the repo root, F-011), and **watch paths** `wholesale/<app>/**` plus the root `pnpm-workspace.yaml`, `package.json`, `pnpm-lock.yaml`, so a change to one app never redeploys another; a Medusa catalog change redeploys all of them. The "Build Path" column above is the app folder, not the Dokploy Build Path field.

### Shared core and release branches (plan §4–§5)

**Build from the repo root.** Wholesale moved in its SC-1 PR (`docs/TASKS.md` → *Shared core*). For each app (`backend`, `storefront`) and the worker, in Dokploy:
- **Repository:** `medusa-platform` (General → Provider: GitHub; Branch `main`). Projects created for the old `medusa-apps` repo get no changes from this repo until this is switched; if the repo isn't in the dropdown, give the Dokploy GitHub App access to it first (GitHub → Settings → Applications → Installed GitHub Apps → Configure → Repository access).
- **Docker File:** `wholesale/<app>/Dockerfile` (unchanged).
- **Docker Context Path:** `.` (the repo root) instead of `wholesale/<app>`.
- **Watch Paths:** `wholesale/<app>/**` (the worker: `wholesale/backend/**`) plus `pnpm-workspace.yaml`, `package.json`, `pnpm-lock.yaml` (the root files of the workspace). Since SC-2 (PayWay moved into the core) the backend and the worker also watch `packages/medusa-core/**`.
- **When to switch:** once that app's SC-1 PR is green, change these fields and save **without** redeploying; then the PR merges and staging builds with the new fields. If a build fails, set the fields back and redeploy: the old image keeps running until then.

**Staging and production branches** (SC-3, before this category's first production deploy):
- **Staging** apps keep **Branch `main`**: every merge redeploys the changed apps.
- **Production** apps use **Branch `release/wholesale`**, Trigger **On Push**. Only you move it; Claude never does.
- **Release** (after checking staging), from your own terminal:
  ```bash
  git fetch origin && git push origin origin/main:refs/heads/release/wholesale
  ```
  To release an older checked commit instead, put its hash in place of `origin/main`.
- **Release order** (plan §8.2, D15): a change that reaches several categories (Medusa, pnpm, Node, the core) goes to production Ecommerce → POS → the other four, one at a time, the next after 24 hours of a clean run.
- **Optional record:** tag each release too, e.g. `git tag wholesale-<yyyy-mm-dd> origin/release/wholesale && git push origin wholesale-<yyyy-mm-dd>`. Dokploy still follows the branch; the tag is only a readable history.
- **Rollback:** move the branch back to the previous release, then run any `db:rollback` the release notes need (plan §8.2):
  ```bash
  git push --force origin <previous commit>:refs/heads/release/wholesale
  ```
  The previous commit is in the production app's **Deployments** tab, or in `git log origin/release/wholesale`.
- **GitHub protection** (once, SC-3): **Settings → Rules → Rulesets → New branch ruleset**, target `release/*`, turn on **Restrict updates**, **Restrict deletions** and **Block force pushes**, and add yourself to the **bypass list**, so only you can release and roll back.

## Deploy order (first time)

1. Create `wholesale-postgres` and `wholesale-redis`.
2. Deploy `wholesale-backend` (server). Migrations run on start. Check `https://api.example.com/health`.
3. Create the first admin user from the backend's Dokploy terminal:
   `docker-entrypoint.sh medusa user -e you@example.com -p <password>`
4. In the admin: create a region. Then run `docker-entrypoint.sh medusa exec ./src/scripts/seed-b2b.js` once in the backend terminal (safe to re-run): it creates the **"Wholesale"** sales channel and its **publishable API key** (printed in the log) and puts the products in it (TASKS P4-03). Price tiers: create customer groups and price lists in the admin, and add each company to its group.
5. Deploy `wholesale-worker` (same Build Path, worker overrides).
6. Put the publishable key and backend URL into the storefront's **Build-time Arguments**, then deploy `wholesale-storefront`.
7. Set the final domains in the backend CORS variables and redeploy the backend.

After the first deploy, every service can be redeployed, rebuilt or rolled back **independently**.

## How the pieces connect

- All clients reach the backend only over HTTP. No shared code, no shared files, no shared build.
- Backend CORS must list each client domain:
  - `STORE_CORS` = storefront domain
  - `ADMIN_CORS` = backend/admin domain
  - `AUTH_CORS` = every domain where someone logs in
- The storefront reaches the backend through the public `NEXT_PUBLIC_MEDUSA_BACKEND_URL` (build-time). Runtime `MEDUSA_BACKEND_URL` can be the backend's **internal** Dokploy hostname once starter change 6 in BUILD_PLAN.md §7.2 is applied (faster, private; copy the exact name Dokploy shows for the service, it may carry a suffix). Build-time URLs must be **public**, because the build runs on the build server.
- `NEXT_PUBLIC_*` values are baked in at build time. Changing one = rebuild that client.

## Independence rules

- Shared backend code comes only from `packages/medusa-core` (plan §4–§5); this category's own code stays here, and its clients never use the core.
- This project has its **own** Postgres and Redis. Never point two businesses at the same database.
- A second business of the same type = a second Dokploy project built from the same folder, with its own env.
- To add another category's features to this business (e.g. POS for a marketplace), add that module to **this** backend; do not deploy a second backend.
