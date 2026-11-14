# Build Plan — Medusa Platform

> **Revision 1 (2026-11-14, owner: "make a fresh plan structure", "focus only the share core mode").** The first plan of `medusa-platform`. It is built around the **shared core** (§4, §5): six categories of Medusa apps in one pnpm workspace, sharing one package, `packages/medusa-core`. Everything already built is kept, in §9. The plan this repo started from (medusa-apps, up to its Revision 16) is at tag `pre-shared-core`: `git show pre-shared-core:BUILD_PLAN.md`. TASKS F-089, F-090, F-091.

**Status (2026-11-14).** All six categories have their code. Ecommerce and POS run on staging; no category is in production yet. **Next is the shared core** (§5): the SC-1 proof, then SC-1 and SC-2. The product backlog (§10) follows. Progress and evidence: `docs/TASKS.md`.

**Versions in this repo (checked 2026-11-12)**

| Package | Version | Since |
|---|---|---|
| Medusa (`@medusajs/*`, every app) | **2.22.6** (security release: stricter `fields` / filter / `order` query parsing) | 2026-11-10 (V-06) |
| `@medusajs/ui` | **4.2.13** (the version `@medusajs/dashboard@2.22.6` depends on) | 2026-11-10 |
| Node | `>=22.23.4` | 2026-11-06 |
| Next.js (every client) | **16.4.5** | 2026-11-06 (V-04) |
| pnpm | **12.18.0** (V-07) | 2026-11-12 |
| Starters | `dtc-starter` (`6440e85`) and `b2b-starter` (`f352e3c`) on 2.22.6 | 2026-11-09 |

Updates are separate tasks (§8.2). This table records what the code uses.

**Contents**

1. Goals and rules
2. Glossary
3. Architecture
4. Shared core
5. Shared core migration
6. Medusa compatibility
7. App standards
8. Deploy and release
9. Categories
10. Build order and backlog
11. Verified technical notes
12. Decisions and risks
13. Plan lock and revisions

---

## 1. Goals and rules

| # | Rule | How this plan meets it |
|---|---|---|
| R1 | Official Medusa only, never modified; latest Medusa and pnpm | Medusa is used **only as published npm packages** (`@medusajs/*`): no fork, no git submodule, no `pnpm patch`, no edits in `node_modules`. Custom code goes only through official extension points (§6.1). Boilerplate is copied from the official starters (§7). |
| R2 | Always compatible with Medusa updates; an update can be deployed at any time | Exact version pins, set once in the root catalog (§4.3), a scripted update, a CI gate before any deploy (build, typecheck, tests, migrate, health check), staging first, production only when the owner moves the category's release branch, and Dokploy rollback (§6, §8). |
| R3 | Dokploy-ready: one folder per category, each with its backend **and** clients, each app with its own `Dockerfile` and env, each deployed on its own | Six category folders, one sub-folder per app, each with its own `Dockerfile`, `.env.example`, `package.json` and Dokploy app (§3, §8.1). The repo is one pnpm workspace; Docker builds from the repo root (§4.3, §5). |
| R4 | Each app has its own dependencies | Each app lists its own dependencies in its own `package.json`. Medusa versions come from the root catalog, so every app is on the same release. Shared backend code lives only in `packages/medusa-core` (§4). |
| R5 | Shared code is written once | Code that is the same in several backends lives in the core, and each app switches on only the features it uses (§4). Nothing is copied between apps by hand. |
| R6 | A plan with a build order, kept at the root | This file: the migration order in §5, the build order and backlog in §10. |

**Honest limit on R2.** The starters are templates that get copied, not packages, so their upstream changes are merged by hand (§8.3). No repo can promise that every future Medusa release is non-breaking: Medusa sometimes ships breaking changes in minor versions (listed in its release notes), and database migrations only go forward. This plan does guarantee three things:
- an update never reaches production without passing the CI gate
- a Medusa update moves every app's version at once (one catalog), and each category's production follows only when the owner moves its release branch
- the previous working image can be deployed again

---

## 2. Glossary

These words mean one thing each, everywhere in this repo (docs, comments, package descriptions). `deployable` survives only as a variable name in CI and `scripts/`.

| Word | Meaning | Don't write |
|---|---|---|
| **category** | One of the six folders (`ecommerce`, `pos`, `booking-services`, `wholesale`, `reseller`, `marketplace`): one kind of business, deployed as one Dokploy project per business | scenario, business project |
| **business** | One real shop running a category, with its own Dokploy project, databases, domains and env. "Same category, many businesses" | project (alone) |
| **app** | One folder inside a category with its own `package.json`, `Dockerfile` and `.env.example`: `backend`, `storefront`, `pos-app`, `seller-portal`, `vendor-portal`, `provider-portal` | deployable |
| **backend** | The Medusa app of a category. Deployed twice: the **server** (HTTP, admin, migrations) and the **worker** (jobs, subscribers) | Medusa app (for ours) |
| **client** | Any app that isn't the backend: the **storefront**, a **portal** (`seller-portal`, `vendor-portal`, `provider-portal`) or the **pos-app** | web client, frontend |
| **core** | The package `packages/medusa-core`. **Shared core** names the design (§4) | share core, plugin (for ours) |
| **feature** | One unit of the core that a backend switches on (§4.2), e.g. PayWay or wishlist | module (unless it is a Medusa module) |
| **library mode** | How backends use the core: import and register its parts themselves, never list it under `plugins` (§4.1) | — |
| **workspace**, **catalog** | The root pnpm workspace and the Medusa versions in its `pnpm-workspace.yaml` (§4.3) | monorepo (for ours) |
| **staging**, **production** | The two Dokploy environments of a business; staging follows `main`, production follows the category's **release branch** `release/<category>` (§8.1) | — |
| **phase** | A build stage of §10 (Phase 0 to 6) | — |
| **task**, **finding**, **decision** | IDs in `docs/TASKS.md` and §12: tasks `P<phase>-<n>`, `SC-<n>`, `V-<n>`, `E-<n>`; findings `F-<n>`; decisions `D<n>`; risks `R-<letter>` | — |

---

## 3. Architecture

```
medusa-platform/                    <- pnpm workspace (§4.3; from SC-1)
├── package.json                    <- private root: packageManager and workspace scripts only
├── pnpm-workspace.yaml             <- workspace packages, the Medusa `catalog`, pnpm settings
├── packages/
│   └── medusa-core/                <- the core (§4), used by backends in library mode (from SC-2)
├── README.md                       <- overview and status
├── BUILD_PLAN.md                   <- this file, frozen (§13); its lock names this path
├── CLAUDE.md                       <- builder entry point (Claude Code reads it from the root)
├── docs/
│   ├── MEDUSA_SKILL.md             <- the only allowed Medusa reference, per version
│   ├── DEV_FLOW.md                 <- the builder's cycle and gates
│   ├── TASKS.md                    <- open tasks, decisions, live findings, handoff
│   ├── PRE_DEPLOY_AUDIT.md         <- the audit before a category's first deploy (§8.2)
│   └── PLAN_LOCK.md                <- owner's how-to for the plan lock
├── .claude/                        <- builder settings, the plan lock hook, the medusa-v2 skill
├── .github/                        <- CI matrix (one entry per app) and the weekly update check
├── scripts/                        <- plain shell scripts
│   ├── update-medusa.sh            <- §8.2
│   ├── verify.sh                   <- DEV_FLOW gates 1–4; `--image` builds and smoke-tests the image
│   ├── guard.sh                    <- repo guardrails (DEV_FLOW gate 5), also run in CI
│   └── test-plan-lock.sh           <- tests the plan lock (§13.1)
│
├── ecommerce/                      <- one category = one Dokploy project per business
│   ├── README.md                   <- Dokploy guide for this category
│   ├── DOKPLOY_STAGING.md          <- click-by-click staging runbook (also in pos/, booking-services/)
│   ├── docker-compose.local.yml    <- local stack (§7.3)
│   ├── backend/                    <- Medusa (server + worker)
│   └── storefront/                 <- Next.js shop
├── pos/                            <- backend, storefront, pos-app (Next.js PWA for the counter)
├── booking-services/               <- backend, storefront, provider-portal (P3-32)
├── wholesale/                      <- backend, storefront (B2B shop, sign-in required)
├── reseller/                       <- backend, storefront (one site for every seller domain), seller-portal
└── marketplace/                    <- backend, storefront, vendor-portal
```

| Category | Apps (each with its own Dockerfile, env and Dokploy app) | Copied from |
|---|---|---|
| ecommerce | backend (+ worker), storefront | `dtc-starter` |
| pos | backend (+ worker), storefront, pos-app | Ecommerce; pos-app is a plain Next.js app |
| booking-services | backend (+ worker), storefront, provider-portal (P3-32) | Ecommerce; provider-portal from the vendor-portal |
| wholesale | backend (+ worker), storefront | `b2b-starter` |
| reseller | backend (+ worker), storefront, seller-portal | Ecommerce; seller-portal is a plain Next.js app |
| marketplace | backend (+ worker), storefront, vendor-portal | Ecommerce; vendor-portal from the seller-portal |

Names are lowercase kebab-case, because they become Dokploy build paths, image names and database names.

**Boundaries:**
- **The only shared code is the core** (§4). No app imports from another app or category. A new shared package needs an owner-approved plan revision.
- **Clients talk to their backend only over HTTP**, and never depend on the core.
- **Each app keeps** its own `Dockerfile`, `.env.example`, compose file and Dokploy app. Images build from the repo root and install only that app and the workspace packages it uses (§5).
- **Code one app needs stays in that app.** Boilerplate that differs between apps stays duplicated; only code the apps really share moves to the core.
- **The backend image runs twice per business** (server and worker); every other app once.
- **A category copied from another** was a full copy at the time (F-034, F-044, F-061, F-072); from SC-2 on, the shared parts come from the core instead. The starter's eight generic `backend/src/*/README.md` guides are not kept (F-053).

---

## 4. Shared core

### 4.1 Library mode

`packages/medusa-core` is private and never published. It is built with Medusa's plugin tooling (`medusa plugin:build`, docs `learn/fundamentals/plugins`), and backends use it as a **library**:
- **Providers and modules** are registered in the app's `medusa-config.ts` from the core's exports (`<core>/providers/<name>`, `<core>/.medusa/server/src/modules/<name>`).
- **Routes, subscribers, jobs and links** are one-line files in the app that re-export the core's (Medusa finds them by their place in the app's `src/`).
- **Middlewares** stay in the app's own `src/api/middlewares.ts`, which imports the core's middleware functions, so each app keeps control of its route order.
- **Workflows and helpers** are imported where they are used.
- **Admin widgets** stay in the apps unless the SC-1 proof shows a core widget works.

**Why not `plugins`:** for every `plugins` entry Medusa registers every module in the package and loads every route, subscriber, job and link it has (`@medusajs/utils` `get-resolved-plugins`, read 2026-11-14, F-090). One package would then switch every feature on in every app: Wholesale would get the wishlist tables and the Telegram webhook just to use PayWay. The SC-1 proof confirms library mode works (§5); if it doesn't, the owner picks a fallback (§5.4).

### 4.2 Features

What goes in is only code that is the same in several backends (measured 2026-11-14: about 40 files in 5 or 6 apps; F-090). It is grouped by feature, and each feature moves with everything it needs: provider or module, links, routes, workflows, subscribers, jobs, helpers and unit tests.

| Feature | Contents | Used by |
|---|---|---|
| **PayWay** | ABA PayWay payment provider (`pp_payway_payway`) and its helpers | all six |
| **Notifications** | Resend email provider with a hook for app templates (Booking's reminder), order notifications (workflow, subscriber, helpers) | five (not wholesale) |
| **Telegram** | both bots (staff alerts, customer updates), module `telegram_links`, the webhook and order link routes, customer updates, the Telegram contact helper | five |
| **Wishlist** | module `wishlist`, its three links and five routes, workflow and share helper | five |
| **Account security** | auth emails (with a hook for Marketplace's vendor email), password change and reset, CAPTCHA, per-IP rate limits, phone and contact checks, the upload limit | five |
| **Housekeeping** | the unverified-account cleanup (job and workflow), the storefront revalidate subscriber | five |

Where one app differs, the core offers a hook or that app keeps its own version. Wholesale uses PayWay only.

### 4.3 Workspace and catalog

- **Medusa versions** are set once, in the `catalog` of the root `pnpm-workspace.yaml`; apps write `"catalog:"`. Other dependencies stay in each app's `package.json`.
- **pnpm settings** (`publicHoistPattern`, `allowBuilds`, `overrides`, `minimumReleaseAgeExclude`) are read only from the root `pnpm-workspace.yaml`, so each app's settings are merged there when it joins. A setting one app doesn't share (Wholesale has no `tsconfig-paths` override) is checked against that app's lockfile first.
- **Lockfile:** one per app (`sharedWorkspaceLockfile: false`) or one at the root, decided by the SC-1 proof (§5.1).
- **The core** declares `@medusajs/framework` as a peer dependency (docs `learn/configurations/pnpm`), and its Medusa packages as dev and peer dependencies (docs `learn/fundamentals/plugins/create`).

### 4.4 Data stays the same

A move into the core never changes what is stored:
- **Providers:** each `static identifier` and config `id` stays: PayWay `payway` + `payway` = `pp_payway_payway` (stored on payments and regions); `notification-resend` + `resend`; `notification-telegram` + `telegram` and `telegram-customer`.
- **Modules:** module keys, table names, link definitions and migration file names stay, so `db:migrate` on a database that already has them runs nothing new. A plugin's module migrations are generated in the package (`npx medusa plugin:db:generate`) and run by the app's own `db:migrate` (docs `learn/fundamentals/plugins/create`).
- **Links** move with their module, and are never defined in both the app and the core.

### 4.5 Tests

- **The core** has its own unit tests and its own CI entry.
- **HTTP and module tests stay in the apps**, because they test how each app wires the feature.
- **CI runs every app on every PR** (it already does for all 15 apps); no path filter may skip an app when the core or a root file changes. `ci-ok` passes only when all of them pass.

---

## 5. Shared core migration

One PR per step; DEV_FLOW gates green and the skill check (DEV_FLOW §7.1), then pre-merge checks and squash auto-merge. Tag `pre-shared-core` (`48f02c9`) is the way back. P3-19 and the Booking staging wait for SC-1 and SC-2.

### 5.1 SC-1 proof

On a throwaway branch, never merged: a root workspace with the catalog, a minimal core holding one provider, one module with a migration, one route and one subscriber, and `ecommerce/backend` using them in library mode. It must show:
1. install, build, typecheck and tests pass;
2. the app's image builds from the repo root and answers `/health`, with the production install made by `pnpm --filter <app> --prod deploy` (since pnpm 12.2.0 this turns workspace and catalog dependencies into a portable install; today's `.medusa/server` install can't resolve `catalog:` or `workspace:`, because `medusa build` copies `package.json` as is, F-090);
3. the provider, module, route and subscriber work without a `plugins` entry;
4. an app not yet moved, still with its own `pnpm-workspace.yaml`, installs and builds as today inside the root workspace;
5. the lockfile layout, with its reason (one per app is tried first: it keeps each app's lockfile, CI cache path and watch paths as today);
6. whether the image needs a root `.dockerignore` or one per Dockerfile.

Results go into TASKS and MEDUSA_SKILL, and the first SC-1 PR rewrites §7.1 and §7.2 from them, as a plan revision.

### 5.2 Steps

| Step | What | Done when |
|---|---|---|
| **SC-0** | This plan, `CLAUDE.md`, the READMEs and staging runbooks, MEDUSA_SKILL, TASKS; tag `pre-shared-core` | merged |
| **SC-1 proof** | §5.1 | every point shown, with evidence |
| **SC-1** | Root `package.json` and `pnpm-workspace.yaml` with the catalog and the merged pnpm settings, **one category per PR, Ecommerce first**: each of its apps writes `"catalog:"`, drops its own `pnpm-workspace.yaml`, builds from the repo root with the proven recipe, and gets its new Dokploy context and watch paths. `scripts/update-medusa.sh` (one catalog edit), `verify.sh`, `guard.sh` (the exact-pin check reads the catalog), the weekly update check and the CI matrix follow | each app's lockfile changes only in the expected Medusa lines; the category's staging redeploys and answers `/health` (categories not on staging yet: the local stack) |
| **SC-2** | The core in library mode, **one feature per PR** in the order of §4.2: PayWay → notifications → Telegram → wishlist → account security → housekeeping. Every app using the feature switches from its own copy in the same PR | every app's tests pass; on a copy of a migrated database `db:migrate` runs nothing and the provider IDs still match (§4.4) |
| **SC-3** | Release branches: `release/ecommerce` and `release/pos` first, then the rest; GitHub protection on `release/*`; production apps point at them. No category is in production yet, so this lands **before the first production deploy** (P1-08). The owner creates and moves them | the owner has moved each branch once |

### 5.3 Dokploy order for SC-1

Once an app's SC-1 PR is green, the owner changes that app's Dokploy fields (Docker Context Path `.`, the new watch paths) and saves **without** redeploying. Then the PR merges and staging builds with the new fields. If the build fails, the old image keeps running; set the fields back and redeploy. Each category README has the steps.

### 5.4 Stop rule and fallbacks

The fix cycle's limit holds for every step (3 attempts without new evidence → Blocked, ask the owner). If the SC-1 proof can't show points 2 or 3, nothing in `main` has changed, and the owner chooses between:
- **(a) catalog only:** SC-1 without SC-2, which already removes the version drift;
- **(b) synced copies:** the core as the single source, copied into each app by a script, with `guard.sh` failing when a copy drifts. Each app then builds as today.

---

## 6. Medusa compatibility

### 6.1 Allowed extension points (official, versioned APIs)

| Need | Use | Never |
|---|---|---|
| New data | Custom **module** (`src/modules/*`) with its own tables | Columns on core tables |
| Relate custom data to Medusa data | **Module links** (`src/links/*`, `defineLink`) | Foreign keys into core tables |
| Business logic | **Workflows** and steps with compensation (`src/workflows/*`) | Overriding core services |
| Change Medusa flows (add to cart, checkout) | **Workflow hooks** (`validate`, …) or a custom workflow that *calls* Medusa's workflows | Copying and editing Medusa's workflow code |
| React to events | **Subscribers** (`src/subscribers/*`) | Patching the event bus |
| Background tasks | **Scheduled jobs** (`src/jobs/*`) | External cron calling internals |
| New endpoints | **API routes** (`src/api/*`) and middlewares | Monkey-patching Medusa's routes |
| Admin UI | **Admin widgets and UI routes** (`src/admin/*`) | Forking the dashboard |
| Payments, email, files, … | **Module providers** (e.g. `AbstractPaymentProvider`) | Patching Medusa's modules |
| Infrastructure | Official modules configured in `medusa-config.ts` (Redis, S3, …) | Forks of infrastructure modules |
| Shared code | The core in library mode (§4) | Copies maintained by hand |

"Core tables" and "core flows" mean Medusa's own; "the core" alone means `packages/medusa-core`.

### 6.2 Version policy

- **One Medusa version for every app.** Every `@medusajs/*` package on the Medusa release line is pinned to the **same exact version** (no `^` or `~`): in each app's `package.json` until its SC-1 PR, then once in the root catalog.
- **`@medusajs/ui` has its own version line.** Pin it to the exact version `@medusajs/dashboard@<medusa version>` depends on, so the lockfile holds one copy (F-006). `update-medusa.sh` reads it from the dashboard. For 2.22.6 that is 4.2.13.
- **pnpm:** `packageManager: "pnpm@<exact>"`; the Dockerfiles and CI install exactly that version. A new pnpm release is taken once it is about a week old (V-03), because it runs every install.
- **pnpm's minimum release age:** pnpm 12 refuses packages younger than its minimum release age. An update on release day writes `minimumReleaseAgeExclude` entries for the exact new versions into the `pnpm-workspace.yaml` that holds the settings. Keep them for a security release, and remove them at the next update (F-057).
- `pnpm install --frozen-lockfile` everywhere (CI, Docker, local checks). A build never resolves new versions on its own.
- **Public imports only:** `@medusajs/framework/*`, `@medusajs/medusa/*`, `@medusajs/medusa/core-flows`, `@medusajs/admin-sdk`, `@medusajs/ui`. Never from `dist/` paths.
- **Licensed Medusa features are not used.** Since 2.22 the RBAC module and the `auth-oidc` provider need a `MEDUSA_LICENSE_KEY` (F-042). Cashiers, sellers, vendors and providers are custom actor types.
- **Security fixes in dependencies** (`pnpm audit --prod`): first refresh the lockfile within the ranges Medusa and the starters already allow. An `overrides` entry is a deviation that needs owner approval and a `docs/TASKS.md` entry (E-A6).

### 6.3 Tests that protect updates

Every backend keeps integration tests (`@medusajs/test-utils`) for its custom code against real Medusa, and every client must at least build against the updated backend. An update is accepted only if these pass (§8.2).

Tests that depend on background work (scheduled jobs, search indexing) control it or wait for it instead of racing it. For example, a test makes a hold expire right before the step that checks it, and it rebuilds the search index with the Search Module's `reindex` when events may have been lost (F-065).

---

## 7. App standards

There are two standards: **7.1 backend** (the same in every `*/backend`) and **7.2 client** (every `storefront`, `*-portal` and `pos-app`). Each app commits its `Dockerfile`, `.dockerignore` and `.env.example`; backends also commit `docker-entrypoint.sh`. An app with no code yet keeps these as templates.

> The per-app package setup below (own lockfile, a settings-only `pnpm-workspace.yaml`, Docker steps from the app folder) holds for each app until its SC-1 PR (§5). The first SC-1 PR rewrites §7.1 and §7.2 for the workspace, from the SC-1 proof.

### 7.1 Backend standard (`<category>/backend/`)

```
<category>/backend/
├── package.json              # own deps, exact @medusajs pins, packageManager
├── pnpm-lock.yaml            # own lockfile
├── pnpm-workspace.yaml       # pnpm settings for this app only (no `packages:` key), until SC-1
├── medusa-config.ts          # env-driven; custom modules listed at the top
├── tsconfig.json, jest.config.js, instrumentation.ts   # from the starter
├── Dockerfile                # multi-stage
├── docker-entrypoint.sh      # migrations + start, server/worker aware
├── .dockerignore, .gitignore
├── .env.example              # every variable documented
├── README.md                 # what it is, starter commit, how to run and deploy
├── integration-tests/
└── src/
    ├── modules/<category>/   # models, service, migrations (+ .snapshot-*.json)
    ├── links/
    ├── workflows/
    ├── subscribers/
    ├── jobs/
    ├── api/
    ├── admin/
    ├── search/               # Search Module index definitions (starter ships product.ts)
    ├── migration-scripts/    # data migrations, run by db:migrate on every deploy: never seeds (F-002)
    └── scripts/              # seed scripts (`medusa exec`, e.g. `pnpm seed`)
```

**Where the boilerplate comes from:** `apps/backend` of the official `medusajs/dtc-starter` (Wholesale: `medusajs/b2b-starter`). The starters are pnpm and Turborepo monorepos, so only `apps/backend` is copied, and the workspace-level settings move into this app's own `pnpm-workspace.yaml`. Record the starter commit in the backend README. Add a `predeploy` script (`medusa db:migrate`) and a `typecheck` script; the starter ships neither.

#### `pnpm-workspace.yaml` (per app, until SC-1)

The official [pnpm guide](https://docs.medusajs.com/learn/configurations/pnpm) puts four `public-hoist-pattern` entries in `.npmrc`. pnpm 11 and later don't read them there, so the same entries go into `pnpm-workspace.yaml` as `publicHoistPattern`. Without a `packages:` key the file only holds settings, so the app stays a single package. From SC-1 these settings live in the root `pnpm-workspace.yaml` (§4.3).

```yaml
publicHoistPattern:          # required by the Medusa Admin build
  - "*@medusajs/*"
  - "@tanstack/react-query"
  - "react-i18next"
  - "react-router-dom"
allowBuilds:                 # pnpm blocks install scripts unless allowed
  "@medusajs/telemetry": false   # false = opt out of telemetry
  "@swc/core": true
  esbuild: true
  msgpackr-extract: true
  protobufjs: true
```

#### `medusa-config.ts` behaviour

| Env | Effect |
|---|---|
| `DATABASE_URL` | Postgres connection (one database per business) |
| `DATABASE_SSL` | `false` / `true` / unset → `projectConfig.databaseDriverOptions`. Medusa turns SSL on for any non-localhost database, which hangs migrations on a Dokploy Postgres without SSL, so set `false` there (F-003). |
| `REDIS_URL` set | Sets `projectConfig.redisUrl` (session store) and enables the modules from the official [deployment guide](https://docs.medusajs.com/learn/deployment/general): `caching` with provider `@medusajs/caching-redis` (a separate npm package), `event-bus-redis`, `workflow-engine-redis` (`{ redis: { redisUrl } }`), and `locking` with provider `locking-redis`. All of them use one Redis URL. Unset = in-memory (dev only). |
| `MEDUSA_FF_CACHING` | `true`. The Caching Module, which the deployment guide configures, is behind this feature flag; the old `cache-redis` module has been deprecated since v2.11.0. |
| `MEDUSA_WORKER_MODE` | `projectConfig.workerMode`: `shared` (default), `server` (HTTP only) or `worker` (jobs and subscribers only) |
| `DISABLE_MEDUSA_ADMIN` | `admin.disable`; `true` on workers |
| `MEDUSA_BACKEND_URL` | `admin.backendUrl`; leave empty when the same app serves the admin |
| `S3_*` set | Enables `file` with the `file-s3` provider (S3 and S3-compatible servers: R2, MinIO, RustFS, SeaweedFS). Containers are ephemeral, so production uploads must go to S3. Use one bucket per shop and environment, with no key prefix (F-025). |
| `S3_ACL` | Empty = Medusa's default per-file ACL; `false` = send no ACL header (needed for AWS buckets with Object Ownership "Bucket owner enforced", F-025). |
| `STORE_CORS`, `ADMIN_CORS`, `AUTH_CORS`, `JWT_SECRET`, `COOKIE_SECRET` | Standard Medusa settings |
| `SESSION_COOKIE_SECURE` | `false` only in the local stack (plain http), so the admin session cookie isn't marked Secure. Never set it on Dokploy (F-043). |
| `STOREFRONT_URL` | Used for links in account emails (verification, password reset) and for the storefront cache refresh. Without it, sign-up emails aren't sent. Set it in every environment, local stacks included (F-050). |

The variable names match the official deployment guide. Migrations run only on the server, like the guide's `predeploy` step; the worker never migrates.

#### Backend Dockerfile (until SC-1)

1. **Build stage:** `docker.io/library/node:22-bookworm-slim`. The fully-qualified name lets Podman/Buildah build it too, and the image is multi-arch (arm64 and amd64).
2. Copy `package.json`, `pnpm-lock.yaml` and `pnpm-workspace.yaml`. Install the pnpm version read from `packageManager`, then run `pnpm install --frozen-lockfile`.
3. Copy the source and run `pnpm build` (`medusa build` → `.medusa/server`, including the compiled admin).
4. In `.medusa/server`, copy in `pnpm-lock.yaml` and `pnpm-workspace.yaml` (the build doesn't copy the lockfile), then run `pnpm install --prod --frozen-lockfile`. From SC-1 this step becomes the proven `pnpm deploy` recipe (§5.1).
5. **Runtime stage:** same base image. Copy only `.medusa/server`, run as the `node` user, expose `9000`. `medusa start` runs inside `.medusa/server` (F-009), and the entrypoint runs `cd /app` first, because the Dokploy terminal opens in `/` (F-013).
6. **Entrypoint:**
   - **`start`:** runs `medusa db:migrate --execute-safe-links --execute-safe-search` (only when `MEDUSA_WORKER_MODE` ≠ `worker` and `RUN_MIGRATIONS` ≠ `false`), then `medusa start`.
   - **The two flags:** without them `db:migrate` prompts when a link or search index was removed or changed, and a container has no terminal to answer. Safe mode never drops link tables or indexes; dropping them is a manual release step (§8.2).
   - **One replica while migrating:** `db:migrate` takes only a per-module advisory lock (F-004), so still run one server replica.
   - **Other commands** are passed through (e.g. `medusa user -e … -p …` to create an admin).
7. **Build args:** `MEDUSA_BACKEND_URL` (optional, baked into the admin bundle), plus the category's build args in §9 (e.g. Ecommerce's upload ceiling).

There is no `HEALTHCHECK` instruction (Podman ignores it in OCI format). Health checks are set in Dokploy against `GET /health` (§8.1).

#### `.env.example`

Committed per backend, with CORS entries for that category's clients and its category settings (§9). Base keys:

```
NODE_ENV=production
PORT=9000
DATABASE_URL=postgres://user:pass@host:5432/<category>
DATABASE_SSL=false
REDIS_URL=redis://host:6379
JWT_SECRET=
COOKIE_SECRET=
STORE_CORS=
ADMIN_CORS=
AUTH_CORS=
MEDUSA_BACKEND_URL=
MEDUSA_WORKER_MODE=shared
DISABLE_MEDUSA_ADMIN=false
RUN_MIGRATIONS=true
S3_FILE_URL=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_REGION=
S3_BUCKET=
S3_ENDPOINT=
S3_FORCE_PATH_STYLE=false
S3_ACL=
MEDUSA_FF_CACHING=true
STOREFRONT_URL=
```

### 7.2 Client standard (`storefront/`, `*-portal/`, `pos-app/`)

```
<category>/<client>/
├── package.json          # own deps; @medusajs/js-sdk, icons, types, ui-preset on the backend's version
├── pnpm-lock.yaml
├── pnpm-workspace.yaml   # settings only (allowBuilds for sharp, etc.), until SC-1
├── next.config.js        # MUST set output: "standalone"
├── Dockerfile, .dockerignore, .env.example
├── README.md             # starter commit, env, how to deploy
└── src/
```

- **Framework:** Next.js **16.4.5** for every client, so there is one Dockerfile pattern.
  - **Storefronts** start from `apps/storefront` of `medusajs/dtc-starter` (Wholesale: `b2b-starter`). The standalone `nextjs-starter-medusa` was deprecated in Medusa v2.14.
  - **Portals and the pos-app** are plain Next.js apps using `@medusajs/js-sdk`.
  - **Next.js 16 migration:** the storefronts follow the starter's (`6b95717`): ESLint flat config, `default.tsx` for parallel-route slots, async `params`, `revalidateTag(tag, { expire: 0 })`.
- **Starter changes required** (each storefront README lists the ones applied):
  1. **Own package setup:** its own `packageManager`, `pnpm-lock.yaml` and settings-only `pnpm-workspace.yaml`. Carry over the starter root's `pnpm.overrides` (`@types/react`, `@types/react-dom`). Keep `@medusajs/js-sdk`, `icons`, `types`, `ui-preset` and `instantsearch-adapter` on the exact backend version.
  2. **Package name:** rename it (`@dtc/storefront` → `<category>-storefront`).
  3. **`output: "standalone"`** in `next.config.js`.
  4. **Image domains:** read `S3_IMAGE_HOSTNAME` / `S3_IMAGE_PATHNAME` instead of `MEDUSA_CLOUD_S3_*`, so any bucket works.
  5. **Builds don't need the backend:** a `generateStaticParams` that calls the backend returns `[]` on error. This only applies to copies made before `dtc-starter` `f677db4` (2026-10-09); later starters have no such functions.
  6. **Internal backend URL on the server:** `src/lib/config.ts` prefers a server-only `MEDUSA_BACKEND_URL` when `typeof window === "undefined"`, so server-side calls use the private Dokploy hostname.
  7. **Product pages render dynamically:** `export const dynamic = "force-dynamic"` on `products/[handle]/page.tsx`. The starter's `cookies()` helper swallows Next's `DynamicServerError` (F-015).
  8. **`outputFileTracingRoot: __dirname`** in `next.config.js`, so `server.js` lands at the standalone root (F-010).
  9. **Admin changes reach the shop without a redeploy:**
     - an on-demand route `/api/revalidate` (secret header, `revalidatePath("/", "layout")`), called by a backend subscriber on catalog events
     - `revalidate: 600` on catalog fetches, as a safety net for changes without events (e.g. price lists; P1-10)
  10. **Orders are never cached:** `retrieveOrder` and `listOrders` use `cache: "no-store"` (F-052).
  11. **No locale calls without translations:** call `GET /store/locales` only when `STOREFRONT_LOCALES=true` (F-051).
  12. **Friendly errors:**
      - `src/app/[countryCode]/error.tsx` and `src/app/global-error.tsx` show a short "Something went wrong" page
      - `poweredByHeader: false`
      - `medusa-error.ts` logs status and path only, never the backend's response body or headers (E-A2, E-A4)
- **Portals and the pos-app call the backend from their own server.** The browser calls the app's own routes, and the app calls the backend with the user's token, which is kept in a sealed httpOnly cookie (`COOKIE_SECRET`). The backend URL and the token never reach the browser (F-040; also the seller-portal, P5-08).
- **Dockerfile:** the same fully-qualified multi-arch base image as the backend.
  - **Build:** `pnpm install --frozen-lockfile`, then `pnpm build`.
  - **Runtime:** copies only `.next/standalone`, `.next/static` and `public` (every client has a `public/` folder), and runs `node server.js` as `node`.
  - **Ports:** storefront 8000; portals and the pos-app 3000.
- **Env split:**
  - **Build-time:** `NEXT_PUBLIC_*`, and anything `next.config.js` reads, are **Dokploy Build-time Arguments** (`ARG` in the Dockerfile). Build-time URLs must be public.
  - **Runtime:** secrets and server-side URLs are runtime variables. The runtime `MEDUSA_BACKEND_URL` can be the internal Dokploy hostname.

| Client | Build-time args | Runtime vars |
|---|---|---|
| storefront | `NEXT_PUBLIC_MEDUSA_BACKEND_URL` (public), `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`, `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_DEFAULT_REGION`, `NEXT_PUBLIC_STRIPE_KEY` (starter's; unused without Stripe), `S3_IMAGE_HOSTNAME`, `S3_IMAGE_PATHNAME` (+ category args) | `MEDUSA_BACKEND_URL`, `REVALIDATE_SECRET` (equal to the backend's) (+ category vars) |
| seller-portal / vendor-portal / provider-portal / pos-app | `NEXT_PUBLIC_MEDUSA_BACKEND_URL`, `NEXT_PUBLIC_BASE_URL` | `MEDUSA_BACKEND_URL`, `COOKIE_SECRET` |

### 7.3 Local stack

Each category has a `docker-compose.local.yml` (Postgres, Redis, backend, clients) to run the whole category locally. Dokploy ignores it.
- **Start it** with Podman (`podman compose -f <category>/docker-compose.local.yml up -d --build`) or Docker.
- **Plain http:** the stack serves http, so the backend sets `SESSION_COOKIE_SECURE=false`. It also sets `STOREFRONT_URL`, so account emails work (F-043, F-050).
- **Networking:** the storefront shares the backend's network namespace, so `localhost:9000` is the backend in the browser and in the container.
- **One stack at a time:** host ports are the same in every category.

For the gates, `scripts/verify.sh` runs against a throwaway Postgres. Wait for its *second* "ready to accept connections" before creating a database: Postgres restarts once during first setup.

---

## 8. Deploy and release

### 8.1 Dokploy

**One category = one Dokploy project per business.** Each category README has the exact service table and first-deploy order.

| Dokploy resource | Settings |
|---|---|
| **PostgreSQL** | One per business. Never share a database between businesses. |
| **Redis** | One per business. |
| **Build fields** (every app) | Build Type **Dockerfile**. The fields are relative to the repo root (F-011): **Build Path `/`**, **Docker File `<category>/<app>/Dockerfile`**, **Docker Context Path `<category>/<app>`** until that app's SC-1 PR, then **`.`** (the repo root; §5.3). |
| **Branches** (D14) | **Staging** apps deploy from **`main`** on every push (watch paths). **Production** apps deploy from **`release/<category>`** (e.g. `release/ecommerce`), which only the owner moves, after checking staging: `git push origin <checked commit>:refs/heads/release/<category>`. **Rollback:** move the branch back to the previous commit (plus `db:rollback`, §8.2). On GitHub, `release/*` is protected: only the owner may update it, and force pushes only for the owner's rollback. |
| **backend (server)** | App `<category>/backend`. Env from `backend/.env.example` with `MEDUSA_WORKER_MODE=server`. Domain → 9000. Health check `/health`. |
| **backend (worker)** | Same build fields and image. Env adds `MEDUSA_WORKER_MODE=worker`, `DISABLE_MEDUSA_ADMIN=true`, `RUN_MIGRATIONS=false`. No domain, no health check. |
| **storefront** | App `<category>/storefront`. Build-time Arguments and runtime env from `storefront/.env.example`. Domain → 8000. |
| **portal / pos-app** | App `<category>/<client>`. Env from its `.env.example`. Domain → 3000. |
| **Health check** (Swarm Settings form) | **Test Commands** takes one array item per box: exactly two boxes, `CMD-SHELL` and `node -e "fetch('http://localhost:<port><path>').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"` (the images have no `curl`). Interval, timeout and start period are in the category runbook. A JSON array pasted into one box never runs, and it caused a staging outage (F-021). After saving, confirm `(healthy)` with `docker ps` on the server. |
| **Update Config** (Swarm Settings form) | Order **Start First**, Failure Action **Rollback**, Parallelism 1, Delay and Monitor 10 s, Max Failure Ratio 0. The dropdowns show blank after saving but are stored (check `docker service inspect … .Spec.UpdateConfig`, F-020). |
| **Watch paths** | Each app watches only `<category>/<app>/**`; the **worker watches `<category>/backend/**`** too. An empty box redeploys it on every push (F-019). After SC-1, each app also watches the root `pnpm-workspace.yaml` and the lockfile it installs from, and backends and workers watch `packages/medusa-core/**`. |
| **Database backups** | Postgres → **Backups**: daily (`0 19 * * *` = 02:00 Cambodia), keep 14, to a **private** S3 bucket used only for backups, with its own access key and one prefix per business. Before go-live, restore the newest backup into a throwaway Postgres and check that orders and products match. RustFS older than 1.0.0 needs `--streaming-upload-cutoff=200M` (rustfs/rustfs#6135). |
| **Server access** | Before production: SSH-key login only, no password login for root or any uid-0 account, no public Postgres port, OS updates applied. |
| **Alerts** (E-A3) | Dokploy **Settings → Notifications** → Telegram to the staff group: **App Build Error**, **App Deploy**, **Database Backup**, **Dokploy Restart**. Dokploy has no "app down" event, so an uptime monitor **outside** the Dokploy server checks the backend `/health` and the shop every 1–5 minutes (D8). |

Small businesses may run one `shared` backend instead of a server and a worker.

**First deploy of a business:**
1. Postgres and Redis.
2. Backend server. Migrations run, and Medusa creates a default sales channel and publishable key on first boot (F-005).
3. An admin user, from the Dokploy terminal: `docker-entrypoint.sh medusa user -e … -p …`.
4. The category's seed, from the same terminal: `docker-entrypoint.sh medusa exec ./src/scripts/seed.js`. It reuses the first-boot channel and key (F-017), and it takes positional arguments only.
5. Copy the publishable key from the admin.
6. Worker.
7. Storefront, with the key as a build arg.
8. Portal or pos-app.
9. Put the final domains into the backend CORS and redeploy the backend.
10. Check that the storefront's key sees products (`/store/products` count > 0, F-017) and that the baked backend URL is right (F-016).

**Afterwards** every app is redeployed, rebuilt or rolled back on its own. Between apps, the coupling is configuration (client URLs in the backend CORS, the backend URL and publishable key in the clients), the catalog and the core. Production moves one category at a time, through its release branch.

**Same category, many businesses:** a second business of the same category is a second Dokploy project with the same Build Paths and its own databases, domains and env.

### 8.2 Updates and release

```
scripts/update-medusa.sh <category|category/app|all> [version] [--pnpm-latest]   # default: npm latest
```

For each app, the script (rewritten for the catalog in SC-1):

1. Reads the target version (`npm view @medusajs/medusa version` when none is given).
2. Sets every `@medusajs/*` dependency on the Medusa release line (the backend **and** that category's clients) to that exact version, and `@medusajs/ui` to the version the dashboard depends on (§6.2). With `--pnpm-latest` it also moves `packageManager` to the latest pnpm.
3. Runs `pnpm install` → a new `pnpm-lock.yaml` (and `minimumReleaseAgeExclude` entries on release day, §6.2).
4. Runs `scripts/verify.sh <category>`:
   - `pnpm build`, then `pnpm typecheck`
   - unit and integration tests
   - fresh Postgres: `medusa db:migrate`, start, `GET /health` = 200, `GET /app` = 200
   - clients: `pnpm build` of each storefront, portal and pos-app against the updated backend
   - with `--image`: build the image and smoke-test `/health`
5. On success, commits `package.json` and `pnpm-lock.yaml` for that category only.

**Release:**

0. **Pre-deploy audit:** before a category's first staging or production deploy, run `docs/PRE_DEPLOY_AUDIT.md` for it.
   - **What it checks:** 10 checks (authorization, reset tokens, input, CORS, rate limits, errors, indexes, logging, secrets, rollback), plus `pnpm audit --prod`.
   - **Report:** goes in `<category>/AUDIT-<date>.md`, and every FIX becomes a `docs/TASKS.md` task.
   - **Going live:** a category goes live only when every row is PASS, N/A or an owner-accepted RISK.
1. **Release notes:** read them for every version skipped (breaking changes are called out there), and run any codemod they list.
2. **Back up the database.** The official revert is `medusa db:rollback <module…>` for each module that migrated, then reinstalling the old versions; the backup is the fallback. The daily backups (§8.1) run regardless.
3. **Removed or changed links and search indexes:** run `medusa db:sync-links --execute-all` / `medusa db:migrate:search --execute-all-search` by hand from the Dokploy terminal, after reviewing the plan they print.
4. **Deploy:** merging to `main` deploys staging (**one** server replica). Smoke test it, then the owner moves `release/<category>` to that commit for production (§8.1, D14). Claude never pushes to `release/*`.
5. **Rollback:** move `release/<category>` back to the previous commit, or redeploy the previous image, **plus** `db:rollback` of the migrated modules, or restore the backup.

**Automation:**
- **No Dependabot or Renovate:** Dependabot supports pnpm v7–v10 only, and this repo pins pnpm 12 (F-008).
- **The weekly check:** `.github/workflows/medusa-update-check.yml` (Mondays 02:00 UTC, also runnable by hand) fails visibly when any app pins an older Medusa than npm `latest`.
- **Updating:** a human then runs `scripts/update-medusa.sh <category>` on a branch, and CI checks the PR.
- **Deploying:** merging redeploys only the changed apps on staging (Dokploy watch paths); a change in the core or the catalog redeploys every staging app that uses it. Production waits for the owner's release branch.
- **CI:** every PR runs the gate of every app, and the core's own tests from SC-2 (§4.5).

**Before every merge** (owner rule, DEV_FLOW §7.1): check the diff against `docs/MEDUSA_SKILL.md` and update every related document. The required CI check is `ci-ok`, and PRs squash-merge.

### 8.3 Starter updates

The starters are copied, not installed. Each backend and client README records the starter commit it came from. To take upstream improvements:
1. Diff the starter between the recorded commit and its latest commit.
2. Apply the relevant parts by hand (in the core when the part is shared).
3. Update the recorded commit.

Medusa package updates for clients go through the update script.

**Starter syncs so far:**
- **2026-11-06:** every client took the `dtc-starter` Next.js 16 migration (`6b95717`), on Next.js 16.4.5 (V-04).
- **2026-11-09:** both starters moved to Medusa 2.22.6.
- **2026-11-10:** every app followed (V-06).

---

## 9. Categories

Each category lists its custom modules (tables prefixed to avoid collisions), links, workflows and hooks, API routes, jobs and subscribers, admin extensions, clients, env and acceptance criteria. **Later** = after launch. "As built" notes record decisions taken while building (evidence in `docs/TASKS.md`, or at tag `pre-shared-core`). From SC-2, the parts listed in §4.2 come from the core.

### 9.1 Ecommerce — `ecommerce/`

- **Custom code:**
  - **Modules:** `telegram_links` (table `telegram_order_chat`: order ID → Telegram chat ID, so the customer bot knows where to send updates) and `wishlist`.
  - **Providers** (§6.1): `resend` (email) and `telegram` (staff alerts and customer updates) notification providers, and the ABA PayWay payment provider.
  - **Everything else** is Medusa plus infrastructure config.
- **Region and catalog:** the Cambodia region (USD checkout, KHR as a second store currency), tax region, Phnom Penh stock location and delivery option, created by `pnpm seed`. Files on S3 (D3). The storefront comes from `dtc-starter` (§7.2).
- **Payments: ABA PayWay** (eCommerce Checkout: cards, ABA Pay, KHQR), a custom `AbstractPaymentProvider` with provider ID `pp_payway_payway` (D1, F-022; Stripe is not available in Cambodia).
  - **Flow:** the customer pays on PayWay's page. PayWay's callback (`/hooks/payment/payway_payway`) and the customer's return to the storefront can each complete the order. The payment status is always confirmed with PayWay's Check Transaction API, never taken from the browser. A paid order is captured at once.
  - **Refunds:** through the PayWay Refund API with ABA's RSA key (`PAYWAY_RSA_PUBLIC_KEY`), or in the PayWay merchant portal.
  - **Whitelisting:** ABA must whitelist the shop and API domains and the server IP, separately for sandbox and live.
- **Notifications (D2):**
  - **Order confirmation email** through **Resend**.
  - **Staff alerts** through **Telegram** for new, shipped, delivered and canceled orders. `notification-local` is used when the keys are empty.
  - **Order updates for customers who opt in:** a second Telegram bot. The confirmation page offers a signed deep link, because a bot can't message first; after Start, the bot sends confirmed, shipped, delivered and canceled updates (P1-17).
- **Contact rules for Cambodia (`kh`):**
  - The shipping phone is required and email is optional; other countries need an email (P1-14, P1-16).
  - A cart with nothing to ship (booked services) asks only for an email or a phone, with no address (F-048).
  - An optional Telegram contact (`@username` or phone) is saved in the order's `metadata.telegram_contact`.
  - These rules are checked in the browser and by store API middlewares, including at cart completion.
- **Cambodia addresses (storefront only, for `kh`; no custom module, no new columns):**
  - **Field order:** First name, Last name, Address, Province / Capital (saved in `province`), Khan / Srok (`city`), Postal code, Country, Company.
  - **Choosing a place:** Province and Khan / Srok are type-to-match lists (English or Khmer) that accept only listed values. The Khan / Srok list shows only the chosen province's districts.
  - **Postal code:** filled in from the Khan / Srok (6 digits; editable, optional).
  - **Place data:** 25 provinces / capital and 210 khan / srok / krong with postal codes, from the Ministry of Posts and Telecommunications list (Prakas No. 77, 30.12.2025, via Open Development Cambodia, CC BY-SA 4.0). It lives in `src/lib/data/kh-locations.ts`, built by `scripts/build-kh-locations.mjs`; regenerate it when the ministry publishes a new list.
  - **Khmer names:** each place keeps its Khmer name (`name_km`). Medusa stores the English name; a future Khmer storefront looks the Khmer one up.
  - **Phone numbers:** 8–15 digits (with `+`, spaces, hyphens, brackets), checked in the browser and the API, and shown as written locally (`012 345 678`, `+855 12 345 678`).
  - **Where addresses show:** checkout, order page, staff alert and email show street, khan / srok and province.
- **Also built:**
  - **Admin changes without a redeploy:** §7.2 change 9.
  - **Admin image uploads:** SVG refused; a size limit (default 0.8 MB) that admins change in **Settings → Store**, up to an env ceiling (default 5 MB, also a build arg for the admin's own check; F-026, F-027).
  - **Items with variants:** alerts and emails list each item with its variant.
  - **Search fix:** the starter's `resolve-product-ids` is fixed for shared product options (F-023).
  - **Abuse limits:** per-IP limits on customer and admin sign-in, sign-up, forgot password, verification and password change, with an optional CAPTCHA (`CAPTCHA_PROVIDER`) on customer sign-in and sign-up (P1-21, E-A1).
- **Search:** the built-in **Search Module** (registered by default since 2.21.1, PostgreSQL provider) with the starter's `src/search/product.ts` and `@medusajs/instantsearch-adapter`. Move to another provider only if Postgres search is outgrown.
- **Env (backend):**
  - **Uploads:** `UPLOAD_MAX_FILE_SIZE_MB`, `UPLOAD_MAX_FILE_SIZE_CEILING_MB` (also a build arg).
  - **Email:** `RESEND_API_KEY`, `RESEND_FROM`.
  - **Telegram:** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_CUSTOMER_BOT_TOKEN`, `TELEGRAM_CUSTOMER_BOT_USERNAME`, `TELEGRAM_CUSTOMER_WEBHOOK_SECRET`.
  - **PayWay:** `PAYWAY_MERCHANT_ID`, `PAYWAY_API_KEY`, `PAYWAY_API_URL` (empty = sandbox), `PAYWAY_RETURN_URL`, `PAYWAY_RSA_PUBLIC_KEY` (refunds).
  - **Storefront links:** `STOREFRONT_URL` and `REVALIDATE_SECRET`.
  - **Abuse limits:** the CAPTCHA keys.
- **Later:** abandoned cart and restock alerts (Commerce Automation recipe), reviews.
- **Acceptance:** browse → cart → checkout → order visible in the admin; the update script and CI gate proven on this category first.

### 9.2 POS — `pos/`

- **Built as a full copy of Ecommerce** (backend and storefront), plus `pos/pos-app` (F-034).
- **Custom module `pos`:**
  - `pos_register`: name, code, is_active
  - `pos_shift`: status open/closed, opened_by, closed_by, opened_at, closed_at, currency_code, opening_cash, counted_cash, expected_cash, notes
  - `pos_cashier`: name, email, is_active; the cashier actor's record (F-036)
- **Links:**
  - register ↔ stock location (many → one)
  - register ↔ sales channel (many → one)
  - shift → orders (one → many)
- **Workflows:**
  - **`open-shift`:** one open shift per register.
  - **`close-shift`:** computes the expected cash from cash payments and stores the variance.
  - **`pos-checkout`** (official POS recipe): creates the sale as a **draft order** in the POS sales channel, applies promotions, records the payment, converts it to an order and links the order to the shift.
- **Cashiers:** a custom actor type **`cashier`** (`/auth/cashier/emailpass`, `authenticate("cashier", ["session", "bearer"])`), because Medusa's admin roles aren't usable (§6.2, R-g).
  - **Invite-only:** an admin creates the cashier first (the answer carries an **invite code**); the cashier registers the invited email and accepts with that code (F-036, review fix B11).
  - **Shifts:** any active cashier can sell on and close any open shift. The shift records who opened and closed it, and each sale records its cashier (`pos_cashier_id`).
- **Payments:**
  - **One provider:** everything goes through `pp_system_default`. Each POS payment session carries `metadata.pos_payment_method` = `cash`, `card` or `qr`, and close-shift counts only `cash` (F-037, F-038).
  - **The money:** the cashier takes it (drawer, card terminal, KHQR stand), and the sale records it.
  - **Later:** a card terminal provider (D1).
- **Stock at the counter:**
  - **Fulfilment:** Medusa takes stock only on fulfilment, which needs a shipping option, so each register location gets a hidden "In store (POS)" option. Stock is reserved at the register's location only.
  - **Reservations:** never moved by changing their `location_id` (upstream `@medusajs/inventory` bug, still in 2.22). Delete the reservation and create it again (F-041).
- **API routes:** `/pos/registers`, `/pos/shifts/open|close`, `/pos/checkout`, `/pos/customers` (cashier), `/admin/pos/*` (reports, register setup), and barcode lookup (an exact match on the variant's `barcode` / `ean` / `upc` / `sku`, F-039).
- **Admin:**
  - a shift report (per register, per cashier, per day);
  - **Cashiers:** invite (the invite code shows on the page; no email is sent), rename, activate or deactivate (F-085);
  - **Registers:** add with a stock location and a sales channel, activate or deactivate (F-085).
- **Clients:**
  - `pos/storefront`: the online shop on the same stock.
  - `pos/pos-app`: a Next.js PWA for tablets with sign-in, barcode scan, cart, customer lookup, payment (cash / card / QR) and receipt. It calls the backend from its own server only (§7.2, F-040).
- **Env:**
  - `POS_CORS`: the pos-app origin, applied by a CORS middleware on `/pos/*`, which the built-in CORS settings don't cover.
  - `AUTH_CORS` also includes the pos-app; `ADMIN_CORS` stays admin-only.
- **Later:** offline queue, click-and-collect, in-store returns of online orders.
- **Acceptance:** a sale at a register reduces stock at that shop's location only; a shift closes with a correct cash variance.

### 9.3 Booking services — `booking-services/`

- **Built as a full copy of Ecommerce** (with PayWay, Resend, Telegram and the Cambodia rules), F-044.
- **Custom module `booking`:**
  - **`booking_resource`:** name, type staff/room/equipment/venue, capacity, timezone, is_active.
  - **`booking_schedule`:** weekday 0–6 (0 = Sunday), start_time and end_time as zero-padded `"HH:MM"` text, with database checks.
  - **`booking`:** resource_id; starts_at and ends_at in UTC; status pending/confirmed/cancelled/expired/completed/no_show; hold_expires_at; customer_id, cart_id, line_item_id, notes; reminder_sent_at.
  - **Capacity:** one booking takes one place of the resource's capacity (F-045, F-046).
- **Links:** resource ↔ product variant (many ↔ many: which services a resource offers); booking → order (many → one).
- **Service methods:** `isSlotAvailable` (overlap and capacity; pending holds count only until they expire) and `createHold`.
- **Hooks and workflows:**
  - **`addToCartWorkflow` `validate`:** the slot must be available.
  - **`add-booking-to-cart`:** creates the hold and the line item together; compensation removes the hold.
  - **`completeCartWorkflow` `validate`:** re-checks the hold. It is read-only, and a hold owned by the same cart counts, so a retried completion stays idempotent.
  - **`updateLineItemInCartWorkflow` `validate`:** blocks quantity changes on booking items above the slot's capacity. A removed item leaves its hold to expire.
  - **Subscriber `order.placed`:** confirms the bookings and links them to the order.
  - **`cancel-booking`:** applies the cancellation policy and triggers the refund.
- **Hold vs. payment:** the hold is extended when the payment session is created. If it still expires, cart completion fails, and the authorized payment is reverted automatically.
- **Jobs:** release expired holds (every minute); reminders 24 h before.
- **API routes:**
  - **Availability:** `GET /store/booking/availability`, `GET /store/booking/slots` (free slots for a service and date).
  - **Changes:** `POST /store/booking/cart` (puts a chosen slot in the cart through `add-booking-to-cart`, F-047) and `POST /store/booking/cancel`.
  - **Account:** `GET /store/customers/me/bookings` (F-049).
- **Admin:** day/week calendar per resource; walk-in booking; the **Bookings** page is the work view.
- **Clients:** `booking-services/storefront` (service pages, a slot picker, and booking management in the customer account) and `booking-services/provider-portal` for staff and partners (P3-32).
- **Services are products with no shipping** (variants per duration or staff level, as in the Ticket Booking recipe). Contact for service-only carts is an email or a phone (§9.1).
- **Env:** `BOOKING_HOLD_MINUTES` (default 15), `BOOKING_DEFAULT_TIMEZONE`, `BOOKING_CANCEL_HOURS`.
- **Acceptance:** two customers can't hold the same slot; an abandoned checkout frees the slot automatically; a cancellation inside the policy refunds.
- **Booking-only shop (F-087).** The storefront and the demo data are booking-only: no demo goods, no Europe region or warehouse, booking wording, and a home page by booking kind. The backend stays a full copy of Ecommerce, so goods can still be sold if the shop adds them. In the admin, every bookable thing is a Medusa product (Medusa's menus stay).
- **Booking kinds.** Each kind is one booking pattern that many businesses reuse:

  | Kind | The customer picks | Examples |
  |---|---|---|
  | **A. Appointment** (built) | a time with a person, room or court | salon, spa, clinic, tutor, photographer, car wash, sports court, karaoke room |
  | **B. Visit at your place** | a time, their address, the problem | repairs (AC, plumbing, electrical, motorbike), cleaning, pest control, installation, laundry pickup |
  | **C. Trip A → B** | pickup and drop-off address, date and time, vehicle size, extras | moving truck with helpers, airport transfer, driver or van for the day, large-item delivery |
  | **D. Scheduled departure** | a departure and a number of seats | bus, van and boat routes; city and temple tours |
  | **E. Rental by dates** | start and end date (and size or variant) | car, motorbike, equipment; wedding tents and chairs; costumes and outfits by size; guesthouse room per night |
  | **F. Event ticket** | an event date, ticket type and quantity | concerts, shows, workshops; follows Medusa's official Ticket Booking recipe (seats as inventory per date and section) |
  | **G. Table reservation** | a time and a party size, free or with a deposit | restaurant, bar, event hall |
  | **H. Event package** | one event date (or days) and many pieces booked together | weddings (venue, costumes, makeup, photographer, tents, car), parties, company events, ceremonies, tour packages |

- **Shared booking features:**
  - **Extras** on a booking (helpers, packing boxes, an extra hour, rental insurance).
  - **Deposit and balance:** pay part now and the rest later, with reminders; H can split into several payments.
  - **Quote first:** the customer asks, the shop prices it, the customer pays to confirm (moving, repairs, catering).
  - **Staff, vehicle or item assignment:** the admin assigns a driver, truck or technician; the assignee gets the job on Telegram.
  - **Reschedule** instead of cancel and rebook.
  - **Recurring bookings** (weekly cleaning), **passes** (10 classes), **waitlist** and **reviews**.
- **Trip pricing (C, D12):** three modes per service: **vehicle size + hours**, **zones** (a price table between areas), and **distance** through a maps provider. Distance needs the owner's maps account and key; without it, the other two modes work.
- **Providers: staff logins and an open marketplace (F-088, D13).** Both, in this category (one business = one category; Marketplace stays a separate category and is not changed):
  - **Actor `provider`**, a custom actor type like Marketplace's `vendor` (§9.6): its own sign-in, `authenticate("provider", …)` on `/providers/*`, a `provider` record in the `booking` module (or a new custom module) with a `role`:
    - **staff:** invite-only, as POS cashiers (invite code, F-036); manages only their own calendar and bookings; no commission.
    - **partner (open marketplace):** signs up, confirms the email, and the admin approves before anything is public (status pending / active / suspended, as `vendor`).
  - **Ownership:** resources, services, listings, events and packages are linked to their provider (module links, no columns on core tables). A provider sees and changes only their own.
  - **Public provider page** in the storefront (e.g. `/providers/<handle>`): photo, bio, address or area, their services and listings, booking.
  - **Partner self-service per kind:** hours and days off (A, B, G), areas and vehicles with pricing (C, D), listings with photos, rules and blocked dates (E), events and seats (F), packages from their own pieces (H).
  - **Money:** the customer pays the shop; a commission per booking at the partner's rate (default from env), with refunds held and flagged and manual payouts, as Marketplace's `vendor_commission` and `vendor_payout` (§9.6). Staff bookings earn no commission.
  - **Admin:** approve, suspend and set commission rates for partners; invite staff; payout report.
  - **`booking-services/provider-portal`:** a Next.js app deployed on its own (copy of `marketplace/vendor-portal`), calling the backend from its own server; one portal, two roles. Env as the other portals (§7.2): `MEDUSA_BACKEND_URL`, `NEXT_PUBLIC_MEDUSA_BACKEND_URL`, `NEXT_PUBLIC_BASE_URL`, `COOKIE_SECRET`; the backend gets `PROVIDER_CORS` (and `AUTH_CORS`) with the portal host, and a default commission rate.
  - **Acceptance:** a partner can't see or change another provider's data or bookings; an unapproved partner shows nothing in the shop; a staff member can't see money; commissions match the bookings, and a refund holds the commission.
- **How each kind is built is decided in its task's research step** (DEV_FLOW §1, evidence ladder in `docs/MEDUSA_SKILL.md` §0), with Medusa's own mechanisms first: products and variants for what is sold, the Ticket Booking recipe for F, draft orders for quotes, order payment collections for balances, module links to the `booking` module, workflows and hooks. A new model or column belongs to the `booking` module (or a new custom module), never to a core table (§6.1).
- **Acceptance (kinds):** each kind can be booked, paid and cancelled from the shop on staging; no two bookings take the same person, vehicle, item, seat or date beyond its capacity; a package confirms all its pieces or none.

### 9.4 Wholesale — `wholesale/`

- **Start from the official B2B starter** (`medusajs/b2b-starter`), applying the same starter changes as §7.1 and §7.2. Extend its modules; don't rebuild them.
  - **Backend:** copied from `47eecab` (the last 2.22.3 commit), then moved to 2.22.6 (F-055).
  - **Storefront:** copied from `f352e3c` (2.22.6) in P4-08.
- **Modules (from the starter, extended):**
  - **`company`:**
    - `payment_terms`: prepaid / net_15 / net_30 / net_60.
    - `credit_limit`: null = not enforced; enforced on net terms only.
    - `tax_id`.
    - `status`: pending / approved (default) / suspended; only `approved` companies buy.
  - **`employee`:** `spending_limit`, `is_admin`.
  - **`quote`** and **`approval`** (from the starter).
  - **`invoice`** (new; see Invoices).
- **Links:** employee ↔ customer (one ↔ one); company ↔ customer group (the price tier).
- **Catalog scope:** a B2B **sales channel** with its own publishable key, so the B2B storefront sees only B2B products (`pnpm seed:b2b`).
- **Who sees the catalog** (F-068, X4): with `WHOLESALE_REQUIRE_LOGIN` on (default), the Store API's product, variant and search routes answer only an employee of an **approved** company; the publishable key alone gets 401, anyone else signed in 403. The storefront's `NEXT_PUBLIC_REQUIRE_LOGIN` shows its pages to the same people and sends others to their account page, which says why.
- **Pricing:** Medusa **price lists** of type `sale` with a customer-group rule (`customer.groups.id`) per tier. A company gets a tier by joining a customer group. Quantity tiers use each price's `min_quantity` / `max_quantity`.
- **Who may buy:** only a signed-in employee of an approved company; a guest may open an empty cart. The company of a cart or order always comes from the customer's employee record, never from cart metadata (F-059).
- **Cart rules (workflow hooks):**
  - **Adding items** (`createCartWorkflow`, `addToCartWorkflow`, `updateLineItemInCartWorkflow` `validate`): an approved company, and the minimum order quantity (`metadata.min_order_quantity` on the variant, else on its product).
  - **Checkout** (`completeCartWorkflow` `validate`): the employee's spending limit (past orders included) and the company's credit limit (outstanding = live orders minus captured).
- **Approvals:**
  - **Threshold:** `approval_settings.approval_threshold` is set by the merchant only. Above it, every switched-on approval type must be approved before checkout; with no threshold, every cart needs approval.
  - **Admin's own cart:** a company admin skips the company-admin approval, but not the sales manager's.
  - **Locked items:** a cart's items can't change while an approval is pending or approved (F-059).
- **Quotes:** `request-quote` / `accept-quote` through draft orders. Accepting a quote runs the checkout rules (own quote, approved company, spending and credit limits on the quoted total).
- **Payments:**
  - **Net-terms companies:** the built-in **system payment provider** (`pp_system_default`). The payment is captured in the admin when the invoice is paid, and the credit limit counts the order until then.
  - **Prepaid companies:** **ABA PayWay** (KHQR and cards), the Ecommerce provider (D9, P4-12). With PayWay set up, prepaid companies must pay with it and net-terms companies by invoice: checked when a payment session starts and at cart completion. Without PayWay keys, everyone pays by invoice.
  - **One order at a time per company:** cart completion and quote acceptance run inside a lock on the company, so two checkouts can't both use the last of the credit (B6). Every placed order is linked to its company, so it keeps counting against the credit after its buyer leaves (B4, B5).
- **Invoices:**
  - **Module `invoice`:** numbers `INV-000001`, one per order, with a snapshot of the company, tax ID and terms, and a due date from the terms.
  - **PDF:** `pdfmake`, following the official invoice tutorial pattern. It is at `GET /admin/orders/:id/invoice` and `GET /store/orders/:id/invoice` (the buyer or their company admin only); `GET /store/invoices` lists what's due.
  - **Language:** every label in English and Khmer, font Kantumruy Pro (SIL OFL; D10, P4-13, F-070). USD and KHR print their sign, other currencies their code.
  - **Dates:** issued when the order is placed, or when a quote is accepted; a cancelled order is listed with nothing due (B2, B3).
  - **Seller details:** from `INVOICE_SELLER_*`.
- **API routes:**
  - **Company:** `/store/companies/me` and `/store/companies/me/employees`. They take the company and role from the customer's employee record; the starter's `/store/companies/:id…` routes are removed (F-058).
  - **Quotes:** `/store/quotes`.
  - **Sign-up:** creates the company and its first admin together.
  - **Colleagues join with consent** (B14): a company admin asks for a **join code** for an email (`POST /store/companies/me/employees` `{ email }`); the colleague, signed in with that email, joins with it (`POST /store/companies/join`). Nobody is added by id.
- **Client:** `wholesale/storefront` (from the `b2b-starter` storefront `f352e3c`, P4-08), a B2B buyer shop behind sign-in (`NEXT_PUBLIC_REQUIRE_LOGIN`): quick order by SKU or CSV, reorder, invoices, quotes, company users and join codes. The starter's catalog for AI agents (UCP, `/buy`, `llms.txt`, sitemap) is off while sign-in is required (F-068).
- **Env:**
  - **Approval:** `WHOLESALE_REQUIRE_APPROVAL` (`true` = a company that signs up in the storefront starts `pending`; companies the admin creates start `approved`).
  - **Invoices:** `INVOICE_SELLER_NAME`, `INVOICE_SELLER_ADDRESS`, `INVOICE_SELLER_TAX_ID`, `INVOICE_SELLER_EMAIL`, `INVOICE_SELLER_PHONE`, `INVOICE_PAYMENT_NOTE`.
  - **Catalog:** `WHOLESALE_REQUIRE_LOGIN` (default on; F-068).
  - **Payments:** `PAYWAY_MERCHANT_ID`, `PAYWAY_API_KEY`, `PAYWAY_API_URL`, `PAYWAY_RETURN_URL`, `PAYWAY_RSA_PUBLIC_KEY` (P4-12), and `pp_payway_payway` enabled on the region.
- **Optional:** ERP integration exactly as in the official ERP recipe.
- **Acceptance:** a Gold company sees Gold prices; an employee over their limit can't complete checkout, and neither can a company over its credit limit.

### 9.5 Reseller — `reseller/`

- **Built as a full copy of Ecommerce** (`reseller/backend` and `reseller/storefront`, F-061). `reseller/seller-portal` is a plain Next.js app (§7.2).
- **Custom module `seller`:**
  - **`seller`:**
    - `handle`: URL-safe.
    - `name`, `email`.
    - `domain`: a lowercase host, unique.
    - `status`: pending / active / suspended; only `active` sellers earn.
    - `commission_rate`: a percent from 0 to 100; null = `RESELLER_DEFAULT_COMMISSION_RATE` (F-062).
  - **`seller_commission`:** `order_id` (unique), `order_total`, `rate`, `amount`, `currency_code`, status pending / approved / paid / cancelled, `paid_at`.
- **Links:** seller ↔ sales channel (one ↔ one; the seller's storefront publishable key). Creating a seller (`createSellerWorkflow`) also creates their channel and key.
- **Commissions:**
  - **Recording:** `record-seller-commission`, triggered by subscriber `order.placed`. It goes order → sales channel → seller → commission and ignores channels without an active seller. It writes one commission per order, guarded by a lock and the unique `order_id`, so a repeated event creates no second one.
  - **Base:** the order's items after discounts, without tax and shipping (`item_total − item_tax_total`; D11, P5-12; the first build used the order total, F-063). `order_total` stores this base.
  - **Cancels and refunds:** an order cancel cancels the commission. A refund keeps the share of the order the shop kept, measured against the captured amount (an order's `total` goes down after a refund); cancelled at 0. A paid commission isn't changed by either, and payouts take the same per-order locks as refunds (B10).
- **Payouts (manual, D11, F-064):**
  - **Payout day:** on `RESELLER_PAYOUT_DAY` (1–28, UTC), a job approves last month's pending commissions.
  - **What's due:** `GET /admin/seller-payouts` reports it.
  - **Paying:** the shop pays outside Medusa and records it with `POST /admin/sellers/:id/payouts` (approved → paid).
  - **Later:** a `seller_payout` record, once statements are needed.
- **Seller auth:** a custom actor type **`seller`** (`/auth/seller/emailpass`; `/sellers/*` routes behind `authenticate("seller", ["session", "bearer"])`).
  - **Invite-only, like POS cashiers:** the shop creates the seller (`POST /admin/sellers`, which returns an **invite code**), and the seller registers, accepts with that code (`POST /sellers/accept` `{ invite_code }`) and signs in. The invited email alone can't take the account (B11).
  - **Suspended sellers** are locked out at once.
  - **CORS:** `/sellers/*` isn't covered by the built-in CORS settings, so a middleware reading `SELLER_CORS` covers it.
- **Admin:** the **Sellers** page and `POST /admin/sellers/:id` (activate, suspend, name, domain, commission rate; P5-13).
- **API routes:**
  - **Seller account:** `/sellers/me`.
  - **Products:** `/sellers/me/products` (choose which of your published products appear in the seller's channel; sellers don't set prices).
  - **Sales:** `/sellers/me/orders` (no customer details) and `/sellers/me/commissions` (with totals per status).
  - **Domain lookup:** `GET /store/sellers/resolve` (domain or handle → an active seller's publishable key).
- **Clients:**
  - **`reseller/storefront`:** one multi-tenant deployment for every seller domain.
    - **Seller lookup:** on the server, from the `Host` header (not `x-forwarded-host`), with `SELLER_RESOLVE_MODE` and `DEFAULT_SELLER_HANDLE`. The domain → key result is cached.
    - **Seller key per request:** sent as the `x-publishable-api-key` header inside the starter's `sdk.client.fetch` wrapper (`src/lib/config.ts`). The build-time `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` is only the shop's own key.
    - **Data cache:** Next.js keeps it per key, because its cache key includes the headers.
    - **Browser search** on a seller's domain needs that origin in `STORE_CORS` (a regex works for subdomains, e.g. `/\.yourplatform\.com$/`; F-082).
  - **`reseller/seller-portal`:** product selection, sales and commissions. It calls the backend from its own server only (sealed session cookie), so it needs neither `SELLER_CORS` nor `AUTH_CORS`; `SELLER_CORS` stays for a browser-side client.
- **Env:** backend `RESELLER_DEFAULT_COMMISSION_RATE` (default 10), `RESELLER_PAYOUT_DAY` (default 1), `SELLER_CORS`; storefront `SELLER_RESOLVE_MODE`, `DEFAULT_SELLER_HANDLE`.
- **Acceptance:** an order in a seller's channel creates exactly one commission, even when the event is delivered twice; orders from your own channel create none.

### 9.6 Marketplace — `marketplace/`

- **Starting point:** `marketplace/backend` and `marketplace/storefront` are a full copy of Ecommerce (owner, F-072), like POS, Booking and Reseller. `marketplace/vendor-portal` is a copy of the Reseller seller-portal.
- **Custom module `marketplace`:**
  - `vendor`: handle, name, email, logo, status (pending / active / suspended; the admin's approval makes it active), commission_rate (null = `MARKETPLACE_DEFAULT_COMMISSION_RATE`)
  - `vendor_admin`: email (unique across vendors, stored lowercased), names
  - `vendor_payout`: amount, currency, status (pending / paid / cancelled), period (calendar month `YYYY-MM`, UTC; one payout per vendor, period and currency), paid_at, reference
  - `vendor_commission`: one per child order; order total, base (items after discounts, without tax and shipping, as Reseller D11), rate, amount, what the vendor is owed (order total − amount), status (pending / approved / paid / cancelled), and `refund_review` (none / to_review / settled) (F-078)
- **Links:** vendor → products, vendor → orders (child orders), vendor → stock locations.
- **Vendor auth:** a custom actor type `vendor`, as in the official Vendors example:
  - **Sign-up:** `/auth/vendor/emailpass/register` → `create-vendor` workflow with `setAuthAppMetadataStep` → `authenticate("vendor", ["session", "bearer"])`, then admin approval. Vendors sign up themselves and confirm their email (`/verify-account` in the vendor-portal, `VENDOR_PORTAL_URL`); nothing works until the admin approves.
  - **The vendor admin's email** comes from the auth identity, never from the request body (F-074). Emailpass matches the email exactly as registered, case included.
  - **Vendor routes** live under `/vendors/*`, and every query is filtered by the signed-in vendor.
  - **CORS:** a middleware reading `VENDOR_CORS` covers `/vendors/*`.
- **Workflows:**
  - **`create-vendor`.** Approving a vendor also gives it its own stock location in the store's default sales channel (F-080).
  - **`create-vendor-product`:** links the product to the vendor and gives it the default shipping profile. A vendor may send `draft` (default) or `proposed`; `published` only when `MARKETPLACE_REQUIRE_PRODUCT_APPROVAL=false`; never `rejected` (F-075). The admin approves by publishing it. A vendor can't attach another vendor's inventory item (review fix A1).
  - **`create-vendor-orders`:**
    - **Route:** a custom `POST /store/carts/:id/complete-vendor`, which the storefront calls instead of Medusa's complete-cart route. It calls `completeCartWorkflow` (the parent order) inside `acquireLockStep` / `releaseLockStep` on the cart id, then runs the split.
    - **The split (`split-vendor-order`)** runs per order, locked on the order id and idempotent (it checks for existing links first). It runs from `complete-vendor` and from an `order.placed` subscriber, so an order Medusa completes itself (the PayWay webhook) still gets its vendor orders (F-079).
    - **Child orders:** one per vendor, even when the cart has a single vendor, so the parent is never a vendor's order (F-076). They are made with the Order Module's `createOrders` as copies of the parent's items (prices, tax lines, discounts), and the parent's stock reservations move to the child items; `createOrderWorkflow` is not used, because it fails when an order takes a variant's last units (F-077). Child orders keep the email and addresses but no customer id, so they don't show in the customer's account. Compensation deletes the child orders.
    - **Shipping is split across vendors** (owner, F-076): each child gets the parent's shipping amounts and shipping discounts times its share of the items' value, rounded to cents; the last child takes the rounding rest, so the children add up to the parent.
  - **`record-vendor-commission`:** one commission per child order, at the vendor's rate. A cancelled child order cancels its commission before payout.
  - **`create-payouts`** (a daily job that pays on `MARKETPLACE_PAYOUT_DAY` for the month before).
- **Parent vs. child orders:** payment lives on the parent order, and vendors fulfil child orders only. The admin order page shows the split (a widget), there is a vendor orders list, and reports count child orders only.
- **Payouts:** manual payouts from a report, as Reseller does. Automate only if the payment provider supports split payments.
- **Refunds (owner: "hold and flag now, automate later", F-078):** refunds are taken on the parent order, which holds the payment. A pending commission whose parent order has a refund is held out of payouts and flagged `to_review` (a `payment.refunded` subscriber, and the payout job checks again). The admin settles it in the payout report's *Refunds to review* section: keep, reduce what the vendor gets, or cancel; the next payout includes a kept or reduced one. A refund after a payout is settled by hand. **Later**, if refunds become common: split each refund across the vendors by share, as Reseller does.
- **Vendor stock (owner: "track it", F-080):** a vendor's product starts with the quantity the vendor gives, at the vendor's own stock location; the portal shows and edits "quantity in stock". Checkout refuses what is out of stock; the reservation is made at the vendor's location and fulfilment takes it from there. "Track stock" off (`manage_inventory: false`) is a per-product setting for made-to-order items.
- **Admin:** vendor approval queue, product moderation, payout report with *Refunds to review*, vendor orders list, order split widget.
- **Clients:**
  - `marketplace/storefront`: shows "Sold by" and vendor shop pages, and places orders through `complete-vendor`.
  - `marketplace/vendor-portal`: products (with stock), orders, fulfilments, payouts. It calls the backend from its own server, like the seller-portal.
- **Env:** `MARKETPLACE_DEFAULT_COMMISSION_RATE`, `MARKETPLACE_REQUIRE_PRODUCT_APPROVAL`, `MARKETPLACE_PAYOUT_DAY`, `VENDOR_CORS`, `VENDOR_PORTAL_URL`.
- **Acceptance:** a cart with items from two vendors produces two child orders that each vendor sees and fulfils separately; payouts equal order totals minus commission.

---

## 10. Build order and backlog

**Order:** the shared core first (§5: SC-0, the SC-1 proof, SC-1, SC-2), then the product backlog. SC-3 lands before the first production deploy.

| Phase | Category | Built | Open (`docs/TASKS.md`) |
|---|---|---|---|
| 0. Foundation | standards proven in `ecommerce/` | done | — |
| 1. Ecommerce | backend, storefront | on staging | production deploy P1-08, exit P1-09, Google sign-in P1-20 |
| 2. POS | backend, storefront, pos-app | on staging, exit passed | — |
| 3. Booking services | backend, storefront | kind A | booking-only shop P3-19, then staging and exit P3-18, providers P3-31 to P3-33, kinds and features P3-20 to P3-30 |
| 4. Wholesale | backend, storefront | code done | staging and exit P4-11 |
| 5. Reseller | backend, storefront, seller-portal | code done | staging and exit P5-11 |
| 6. Marketplace | backend, storefront, vendor-portal | code done | staging and exit P6-13 |

**Rules:**
- **Inside each category:** backend first, then storefront, then portal or pos-app. A client starts only once the backend API it needs exists.
- **Booking order:** P3-19 (shop and data, kinds A and G) → P3-18 on a fresh database → P3-31 to P3-33 (providers) → B → C → E → D → F → shared booking features → H, which needs B, C, E and the shared features. Each later kind brings its provider side.
- **Each phase ends with:**
  - the CI gate green for every app in the category
  - the whole category deployed to a Dokploy staging project, using only its committed `Dockerfile`s and `.env.example`s
  - one Medusa update done with `scripts/update-medusa.sh`
  - each app redeployed alone once, to prove independence
- **Don't start two large pieces of work at the same time** (a phase sized L, or the shared core and a new booking kind).
- **Staging may wait (owner; F-034, F-044):** a phase's code can be finished and merged while its staging run and exit checklist wait for the owner. Those items stay open in `docs/TASKS.md` and are done before that category goes live.

---

## 11. Verified technical notes

A throwaway prototype on Medusa 2.21.1 and pnpm 12.6.0 tested the original plan before Phase 0. These findings still hold. `docs/MEDUSA_SKILL.md` has the full, per-version reference, including the shared-core facts (F-090).

| Topic | Finding |
|---|---|
| pnpm 12 and `.npmrc` | The starter's `public-hoist-pattern` lines in `.npmrc` are **ignored**. Put `publicHoistPattern` in `pnpm-workspace.yaml`. |
| pnpm 12 install scripts | Install fails with `ERR_PNPM_IGNORED_BUILDS` until `allowBuilds` is set (`@swc/core`, `esbuild`, `msgpackr-extract`, `protobufjs`; telemetry can be `false`). |
| `medusa build` output | `.medusa/server` has `package.json`, copied as is, but **no lockfile**; copy `pnpm-lock.yaml` and `pnpm-workspace.yaml` in before `pnpm install --prod --frozen-lockfile` (until SC-1, §5.1). |
| Typecheck | `tsc --noEmit` needs `.medusa/types`, which the build generates, so run the build before typecheck. New link aliases are typed only after `pnpm build`. |
| Migrations | `medusa db:generate <module>` needs a reachable database. Commit the migration and the `.snapshot-*.json`. For starter modules with no usable snapshot, first generate with the *unchanged* model, delete that migration but keep the snapshot, then change the model and generate again. |
| Linkable names | `Module.linkable.<camelCase of the model name>`: `booking_resource` → `linkable.bookingResource`. A link without `isList` is one-to-one. |
| Service method names | Generated from the **object keys** passed to `MedusaService({...})`: key `Resource` → `createResources`. |
| Workflows | Returning `when(...).then(...)` directly in `WorkflowResponse` fails typecheck; wrap it: `new WorkflowResponse({ result })`. A failed `run()` rejects with a plain object, not an `Error`. |
| Signed-in user | Read `req.auth_context.actor_id`, not `app_metadata.<x>_id`. |
| Body validation | Opt-in per route: `.strict()` schemas and `req.validatedBody`. |
| Redis modules | Workflow engine options are `{ redis: { redisUrl } }` (`url` deprecated since v2.12.2). The Caching Module needs `MEDUSA_FF_CACHING=true` and `@medusajs/caching-redis`. |
| S3 provider options | `file_url`, `access_key_id`, `secret_access_key`, `region`, `bucket`, `endpoint`, `additional_client_config` (e.g. `forcePathStyle` for MinIO). |
| Plugins | A `plugins` entry switches on every module, route, subscriber, job and link of the package (`get-resolved-plugins`), hence library mode (§4.1). |

---

## 12. Decisions and risks

**Decisions** (evidence in `docs/TASKS.md` → *Decisions log*)

| # | Decision | Choice | Decided |
|---|---|---|---|
| D1 | Payment providers per category; split payments | **ABA PayWay** (cards, ABA Pay, KHQR) as a custom provider for Ecommerce and its copies (F-022). POS records cash / card / QR through `pp_system_default`. Split payments: none so far; Reseller and Marketplace pay out manually. | 2026-09-27 |
| D2 | Notification channels | Customer email through **Resend**; staff alerts through a **Telegram** bot; order updates through a second Telegram bot to customers who opt in | 2026-09-27 |
| D3 | File storage | **S3** or an S3-compatible server (staging: RustFS; SeaweedFS also tested) | 2026-09-25 |
| D4 | Storefront design | Keep the starter's look for now; restyle later | 2026-09-27 |
| D5 | POS app | **Next.js PWA**. Switch to React Native only if hardware (printer, scanner, card reader) needs native access; that app would ship through app stores, not Dokploy | 2026-10-15 |
| D6 | Staging | A separate Dokploy project `<category>-staging` with its own databases, Redis, bucket and domains | 2026-09-25 |
| D7 | Next.js 16 | Every client on 16.4.5 with the starters' migration (§7.2, §8.3) | 2026-11-06 |
| D8 | "App down" alerts | **Open, needed before production:** which uptime monitor runs outside the Dokploy server (recommended: a hosted monitor alerting the staff Telegram) | — |
| D9 | Wholesale payment for prepaid companies | **ABA PayWay** (KHQR, cards); net terms stay on `pp_system_default` (P4-12) | 2026-11-11 |
| D10 | Wholesale invoice language | **Khmer and English**, with an embedded Khmer font (P4-13) | 2026-11-11 |
| D11 | Reseller commission base and payouts | **Items only** (after discounts, no tax or shipping; P5-12); **payouts stay manual** | 2026-11-11 |
| D12 | Booking trip pricing (kind C) | **All three modes:** vehicle size + hours, zones, and distance through a maps provider (the owner's account and key; optional) | 2026-11-14 |
| D13 | Booking providers | **Both:** staff logins (invite-only) and an open marketplace (partners sign up, admin approves, commission and manual payouts), with `booking-services/provider-portal` | 2026-11-14 |
| D14 | Shared code and production releases | **One pnpm workspace** with a Medusa `catalog` and one shared package, `packages/medusa-core`, used in library mode (each app switches on only the features it uses); each app keeps its own Dockerfile, env and Dokploy app. **Staging** deploys from `main`; **production** from `release/<category>`, moved only by the owner (rollback = move it back; `release/*` protected) | 2026-11-14 |

Also decided for Ecommerce:
- **Delivery:** Phnom Penh delivery at launch; more shipping options can be added later in the admin.
- **Contact:** phone first; email and Telegram optional.
- **Backups:** daily backups with a restore test before go-live.

**Risks**

| # | Risk → mitigation | When |
|---|---|---|
| R-a | A Medusa minor release with a breaking change → caught by the CI gate; may need code changes before updating | ongoing |
| R-b | A migration is applied, then a rollback is needed → `db:rollback` or a backup restore | every release |
| R-c | Code shared between apps drifts → the core holds it once (§4); `guard.sh` checks the rules every app shares (exact pins, `packageManager`, safe-mode entrypoint, no demo seeds in migration scripts); copies record their source commit | ongoing |
| R-d | A client is built with an old publishable key or backend URL → they are build args, so changing them means rebuilding that client (documented in each `.env.example`) | ongoing |
| R-e | The worker and the server both run migrations → the worker env always has `RUN_MIGRATIONS=false` | every deploy |
| R-f | Official starters or recipes change → re-check docs.medusajs.com and the starter repos at the start of every phase, not only package versions | every phase |
| R-g | No usable admin roles → every admin user has full access, so cashiers, sellers, vendors and providers never get admin users (custom actor types). RBAC is behind `MEDUSA_FF_RBAC`, enabling it isn't documented, and since 2.22 it needs a paid `MEDUSA_LICENSE_KEY` (F-001, F-035, F-042) | every phase |
| R-h | Two server replicas migrating at once (only per-module advisory locks, F-004) → scale to 1 during deploys | every deploy |
| R-i | Advisories inside `@medusajs/*` that Medusa's own ranges can't fix yet (after 2.22.6: only `zod` 4.2.0, pinned by the starter) → accepted as low risk and re-checked on every update (§6.2, E-A6) | every update |
| R-j | A bug in the core reaches every app → CI runs every app on every PR (§4.5), staging first, production per category through its release branch | every core change |
| R-k | Flaky tests block unrelated PRs → tests control or wait for background work (§6.3, F-065) | ongoing |
| R-l | A move into the core changes stored data → the data invariants of §4.4, checked with `db:migrate` on a copy of a migrated database | SC-2 |

---

## 13. Plan lock and revisions

### 13.1 Plan lock (F-054)

This file is frozen for the builder:
- **The hook:** `.claude/hooks/protect-build-plan.sh`, wired in `.claude/settings.json`. It blocks Claude's file tools and shell writes on `BUILD_PLAN.md`, `.build-plan.sha256`, the hook and `.claude/settings.json`.
- **The switch:** the hook lets the edits through only while the owner's git-ignored switch file exists in that checkout. Only the owner creates or removes it, from their own terminal (`docs/PLAN_LOCK.md`); Claude never does.
- **The checks:** `scripts/test-plan-lock.sh` tests the lock and runs in `scripts/guard.sh`. CI fails until `.build-plan.sha256` matches, and a PR that changes the plan needs the owner's `plan-revision` label.
- **Between revisions:** findings go to `docs/TASKS.md`, and a proposed revision goes to `docs/`.

### 13.2 Revision history

| Rev | Date | What changed |
|---|---|---|
| 1 | 2026-11-14 | First plan of `medusa-platform`, structured around the shared core: glossary (§2), shared core in library mode (§4), migration with the SC-1 proof, data invariants, stop rule and fallbacks (§5); everything already built kept in §9; the backlog after the core (§10); D14, R-j, R-l. Replaces the medusa-apps plan (Revisions 1 to 16, at tag `pre-shared-core`). TASKS F-089, F-090, F-091. |
