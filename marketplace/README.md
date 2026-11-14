# Marketplace — `marketplace/`

> **Vendors sell their own products.** Code done — Phase 6 (exit P6-13 waits for the owner's staging run). Scope: [BUILD_PLAN.md §9.6](../BUILD_PLAN.md).
>
> `backend/` and `storefront/` are a **full copy of Ecommerce** (owner 2026-11-12, TASKS F-072); the vendor features are added task by task (P6-01 onwards). `vendor-portal/` is a Next.js app copied from Reseller's seller portal (P6-09). Local stack: `docker-compose.local.yml` (backend, worker, storefront, vendor portal).

This folder is **one complete category**. Copy the whole folder's setup into one Dokploy project and every piece deploys on its own.

```
marketplace/
├── README.md                <- this guide
├── docker-compose.local.yml <- local stack (Podman or Docker)
├── backend/                 Medusa server + worker
│   ├── Dockerfile
│   ├── docker-entrypoint.sh
│   └── .env.example
├── storefront/              customer storefront
│   ├── Dockerfile
│   └── .env.example
└── vendor-portal/           vendor portal
    ├── Dockerfile
    └── .env.example
```

## Dokploy project: `marketplace`

| Service | Type | Build Path | Port → example domain | Env source |
|---|---|---|---|---|
| `marketplace-postgres` | Dokploy **PostgreSQL** | — | — | database `marketplace` |
| `marketplace-redis` | Dokploy **Redis** | — | — | — |
| `marketplace-backend` | Application (Dockerfile) | `/marketplace/backend` | 9000 → `api.example.com` | `backend/.env.example`, `MEDUSA_WORKER_MODE=server` |
| `marketplace-worker` | Application (Dockerfile) | `/marketplace/backend` | none | same env + worker overrides |
| `marketplace-storefront` | Application (Dockerfile) | `/marketplace/storefront` | 8000 → `shop.example.com` | `storefront/.env.example` (build args + runtime) |
| `marketplace-vendor-portal` | Application (Dockerfile) | `/marketplace/vendor-portal` | 3000 → `vendors.example.com` | `vendor-portal/.env.example` (build args + runtime) |

Every application uses **Build Type: Dockerfile** with **Build Path `/`**, **Docker File** `marketplace/<app>/Dockerfile` and **Docker Context Path** `marketplace/<app>` (both relative to the repo root; verified on Dokploy staging 2026-09-25, finding F-011), and a **watch path** `marketplace/<app>/**`, so a change to one app never redeploys another. The "Build Path" column above is the app folder, not the Dokploy Build Path field.

### Shared core and release branches (plan §4–§5)

**Build from the repo root.** This applies from this category's SC-1 PR on (`docs/TASKS.md` → *Shared core*); that PR says when to switch, and until then the values above stay. For each app (`backend`, `storefront`, `vendor-portal`), in Dokploy:
- **Docker File:** `marketplace/<app>/Dockerfile` (unchanged).
- **Docker Context Path:** `.` (the repo root) instead of `marketplace/<app>`.
- **Watch Paths:** `marketplace/<app>/**` plus `pnpm-workspace.yaml` and the lockfile the SC-1 PR names; the backend and the worker also `packages/medusa-core/**`.
- **When to switch:** once that app's SC-1 PR is green, change these fields and save **without** redeploying; then the PR merges and staging builds with the new fields. If a build fails, set the fields back and redeploy: the old image keeps running until then.

**Staging and production branches** (SC-3, before this category's first production deploy):
- **Staging** apps keep **Branch `main`**: every merge redeploys the changed apps.
- **Production** apps use **Branch `release/marketplace`**, Trigger **On Push**. Only you move it; Claude never does.
- **Release** (after checking staging), from your own terminal:
  ```bash
  git fetch origin && git push origin origin/main:refs/heads/release/marketplace
  ```
  To release an older checked commit instead, put its hash in place of `origin/main`.
- **Optional record:** tag each release too, e.g. `git tag marketplace-<yyyy-mm-dd> origin/release/marketplace && git push origin marketplace-<yyyy-mm-dd>`. Dokploy still follows the branch; the tag is only a readable history.
- **Rollback:** move the branch back to the previous release, then run any `db:rollback` the release notes need (plan §8.2):
  ```bash
  git push --force origin <previous commit>:refs/heads/release/marketplace
  ```
  The previous commit is in the production app's **Deployments** tab, or in `git log origin/release/marketplace`.
- **GitHub protection** (once, SC-3): **Settings → Rules → Rulesets → New branch ruleset**, target `release/*`, turn on **Restrict updates**, **Restrict deletions** and **Block force pushes**, and add yourself to the **bypass list**, so only you can release and roll back.

## Deploy order (first time)

1. Create `marketplace-postgres` and `marketplace-redis`.
2. Deploy `marketplace-backend` (server). Migrations run on start. Check `https://api.example.com/health`.
3. Create the first admin user from the backend's Dokploy terminal:
   `docker-entrypoint.sh medusa user -e you@example.com -p <password>`
4. In the admin: create a region, a sales channel and a **publishable API key**.
5. Deploy `marketplace-worker` (same Build Path, worker overrides).
6. Put the publishable key and backend URL into the storefront's **Build-time Arguments**, then deploy `marketplace-storefront`.
7. Deploy `marketplace-vendor-portal`.
8. Set the final domains in the backend CORS variables and redeploy the backend.

After the first deploy, every service can be redeployed, rebuilt or rolled back **independently**.

## How the pieces connect

- All clients reach the backend only over HTTP. No shared code, no shared files, no shared build.
- Backend CORS must list each client domain:
  - `STORE_CORS` = storefront domain
  - `ADMIN_CORS` = backend/admin domain
  - `AUTH_CORS` = every domain where someone logs in
  - `VENDOR_CORS` = vendor portal domain (custom `/vendors/*` routes)
- The storefront reaches the backend through the public `NEXT_PUBLIC_MEDUSA_BACKEND_URL` (build-time). Runtime `MEDUSA_BACKEND_URL` can be the backend's **internal** Dokploy hostname once starter change 6 in BUILD_PLAN.md §7.2 is applied (faster, private; copy the exact name Dokploy shows for the service, it may carry a suffix). Build-time URLs must be **public**, because the build runs on the build server.
- `NEXT_PUBLIC_*` values are baked in at build time. Changing one = rebuild that client.

## Independence rules

- Shared backend code comes only from `packages/medusa-core` (plan §4–§5); this category's own code stays here, and its clients never use the core.
- This project has its **own** Postgres and Redis. Never point two businesses at the same database.
- A second business of the same type = a second Dokploy project built from the same folder, with its own env.
- To add another category's features to this business (e.g. POS for a marketplace), add that module to **this** backend; do not deploy a second backend.
