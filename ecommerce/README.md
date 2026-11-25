# Ecommerce — `ecommerce/`

> **Direct-to-consumer online store for Cambodia.** Phase 1 built and running on staging; production deploy is TASKS P1-08. Scope: [BUILD_PLAN.md §9.1](../BUILD_PLAN.md).
>
> Features: ABA PayWay checkout, Cambodian addresses (province/district lists, postal codes), phone-first contact with optional email and Telegram, order emails (Resend), staff and customer Telegram updates, S3 file storage, admin upload limits, storefront cache refresh, daily database backups.

This folder is **one complete category**: one Dokploy project, each app built from the repo root (Docker Context Path `.`) and deployed on its own.

```
ecommerce/
├── README.md                <- this guide
├── backend/                 Medusa server + worker
│   ├── Dockerfile
│   ├── docker-entrypoint.sh
│   └── .env.example
└── storefront/              customer storefront
    ├── Dockerfile
    └── .env.example
```

## Dokploy project: `ecommerce`

| Service | Type | Build Path | Port → example domain | Env source |
|---|---|---|---|---|
| `ecommerce-postgres` | Dokploy **PostgreSQL** | — | — | database `ecommerce` |
| `ecommerce-redis` | Dokploy **Redis** | — | — | — |
| `ecommerce-backend` | Application (Dockerfile) | `/ecommerce/backend` | 9000 → `api.example.com` | `backend/.env.example`, `MEDUSA_WORKER_MODE=server`, `ORDER_ACCESS_SECRET` (= the storefront's) |
| `ecommerce-worker` | Application (Dockerfile) | `/ecommerce/backend` | none | same env + worker overrides |
| `ecommerce-storefront` | Application (Dockerfile) | `/ecommerce/storefront` | 8000 → `shop.example.com` | `storefront/.env.example` (build args + runtime); runtime `ORDER_ACCESS_SECRET` (`openssl rand -hex 32`, same value as the backend: guest order details, `packages/medusa-core/src/api/order-access.ts`) |

Every application uses **Build Type: Dockerfile** with **Build Path `/`**, **Docker File** `ecommerce/<app>/Dockerfile` and **Docker Context Path** `.` (the repo root, since SC-1: both apps are in the root pnpm workspace; paths relative to the repo root, F-011), and **watch paths** `ecommerce/<app>/**` plus the root `pnpm-workspace.yaml`, `package.json`, `pnpm-lock.yaml`, so a change to one app never redeploys the other; a Medusa catalog change redeploys both. The "Build Path" column above is the app folder, not the Dokploy Build Path field.

### Shared core and release branches (plan §4–§5)

**Build from the repo root.** Ecommerce moved in its SC-1 PR (`docs/TASKS.md` → *Shared core*). For each app (`backend`, `storefront`) and the worker, in Dokploy:
- **Repository:** `medusa-platform` (General → Provider: GitHub; Branch `main`). Projects created for the old `medusa-apps` repo get no changes from this repo until this is switched; if the repo isn't in the dropdown, give the Dokploy GitHub App access to it first (GitHub → Settings → Applications → Installed GitHub Apps → Configure → Repository access).
- **Docker File:** `ecommerce/<app>/Dockerfile` (unchanged).
- **Docker Context Path:** `.` (the repo root) instead of `ecommerce/<app>`.
- **Watch Paths:** `ecommerce/<app>/**` (the worker: `ecommerce/backend/**`) plus `pnpm-workspace.yaml`, `package.json`, `pnpm-lock.yaml` (the root files of the workspace). Since SC-2 (PayWay moved into the core) the backend and the worker also watch `packages/medusa-core/**`.
- **When to switch:** once that app's SC-1 PR is green, change these fields and save **without** redeploying; then the PR merges and staging builds with the new fields. If a build fails, set the fields back and redeploy: the old image keeps running until then.

**Staging and production branches** (SC-3, before this category's first production deploy):
- **Staging** apps keep **Branch `main`**: every merge redeploys the changed apps.
- **Production** apps use **Branch `release/ecommerce`**, Trigger **On Push**. Only you move it; Claude never does.
- **Release** (after checking staging), from your own terminal:
  ```bash
  git fetch origin && git push origin origin/main:refs/heads/release/ecommerce
  ```
  To release an older checked commit instead, put its hash in place of `origin/main`.
- **Release order** (plan §8.2, D15): a change that reaches several categories (Medusa, pnpm, Node, the core) goes to production Ecommerce → POS → the other four, one at a time, the next after 24 hours of a clean run.
- **Optional record:** tag each release too, e.g. `git tag ecommerce-<yyyy-mm-dd> origin/release/ecommerce && git push origin ecommerce-<yyyy-mm-dd>`. Dokploy still follows the branch; the tag is only a readable history.
- **Rollback:** move the branch back to the previous release, then run any `db:rollback` the release notes need (plan §8.2):
  ```bash
  git push --force origin <previous commit>:refs/heads/release/ecommerce
  ```
  The previous commit is in the production app's **Deployments** tab, or in `git log origin/release/ecommerce`.
- **GitHub protection** (once, SC-3): **Settings → Rules → Rulesets → New branch ruleset**, target `release/*`, turn on **Restrict updates**, **Restrict deletions** and **Block force pushes**, and add yourself to the **bypass list**, so only you can release and roll back.

## Deploy order (first time)

Full steps with every Dokploy field: [DOKPLOY_STAGING.md](./DOKPLOY_STAGING.md) (the same steps serve production, with production values).

1. Create `ecommerce-postgres` and `ecommerce-redis` (runbook §1).
2. Deploy `ecommerce-backend` (server) with the core **and Phase 1** variables (runbook §2.5). Migrations run on start. Check `https://api.example.com/health`.
3. Create the first admin user from the backend's Dokploy terminal:
   `docker-entrypoint.sh medusa user -e you@example.com -p <password>`
4. Seed the Cambodia shop data: `docker-entrypoint.sh medusa exec ./src/scripts/seed.js` (region, USD default + KHR, stock location, delivery option; safe to re-run). It reuses the store, sales channel and **publishable API key** Medusa creates on first boot: copy that key (`pk_…`) from admin → Settings → Publishable API Keys. Optional demo data: `seed-initial-data.js`, then `seed-demo-products.js` (runbook §2.10).
5. Deploy `ecommerce-worker` (same image, worker overrides, the same Phase 1 variables; runbook §3).
6. Put the publishable key, backend URL, `NEXT_PUBLIC_DEFAULT_REGION=kh` and the other build args (runbook §4.2) into the storefront's **Build-time Arguments**, set `REVALIDATE_SECRET`, then deploy `ecommerce-storefront` (runbook §4).
7. Set the final domains in the backend CORS variables and redeploy the backend.
8. Go-live steps (runbook §8): add **payway** to the Cambodia region, ask ABA to whitelist the hosts and server IP, register the customer bot's Telegram webhook, test one order end to end.
9. Database backups and one restore test (runbook §7).
10. Smoke test (runbook §9), and again after every later deploy, staging first.

After the first deploy, every service can be redeployed, rebuilt or rolled back **independently**.

## Staging project: `ecommerce-staging` (decision D6)

Setup from zero and full reference: **[DOKPLOY_STAGING.md](./DOKPLOY_STAGING.md)** (starts with a *Fast path*; Dokploy field names, every variable, health checks, rollback test, backups, alerts).

Staging is a **second Dokploy project** built from this same repo — never a
second environment inside the production project:

| Production | Staging |
|---|---|
| project `ecommerce` | project `ecommerce-staging` |
| `ecommerce-postgres`, `ecommerce-redis` | its **own** Postgres and Redis (never the production ones) |
| `api.example.com`, `shop.example.com` | `api.staging.example.com`, `shop.staging.example.com` |
| production S3 bucket | its own bucket, or a `staging/` prefix (`S3_FILE_URL`, `S3_IMAGE_HOSTNAME` point at it) |
| live ABA PayWay (`PAYWAY_API_URL=https://checkout.payway.com.kh`), real email sender, real bots | PayWay sandbox (`PAYWAY_API_URL` empty), its own bots and backup prefix |

Same Build Paths, same watch paths, same `Dockerfile`s, same `.env.example`
keys — only the values differ. Deploy order is the one above, including the
manual admin user, the `seed.js` step and the publishable key (the key differs per project, so the
storefront's build-time arguments differ too).

Use it for the phase exit checklist: deploy the whole category to staging,
redeploy each app alone, roll one back, then promote the same commit to
production with the §5 runbook (backup first, one server replica while
migrating).

## How the pieces connect

- All clients reach the backend only over HTTP. Clients share no code; backends share only `packages/medusa-core`.
- Backend CORS must list each client domain:
  - `STORE_CORS` = storefront domain
  - `ADMIN_CORS` = backend/admin domain
  - `AUTH_CORS` = every domain where someone logs in
- The storefront reaches the backend through the public `NEXT_PUBLIC_MEDUSA_BACKEND_URL` (build-time). Runtime `MEDUSA_BACKEND_URL` can be the backend's **internal** Dokploy hostname once starter change 6 in BUILD_PLAN.md §7.2 is applied (faster, private; copy the exact name Dokploy shows for the service, it may carry a suffix). Build-time URLs must be **public**, because the build runs on the build server.
- `NEXT_PUBLIC_*` values are baked in at build time. Changing one = rebuild that client.

## Independence rules

- Shared backend code comes only from `packages/medusa-core` (plan §4–§5); this category's own code stays here, and its clients never use the core.
- This project has its **own** Postgres and Redis. Never point two businesses at the same database.
- A second business of the same type = a second Dokploy project built from the same repo, with its own env.
- To add another category's features to this business (e.g. POS for a marketplace), add that module to **this** backend; do not deploy a second backend.
