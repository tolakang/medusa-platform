# medusa-platform

Six categories of [Medusa](https://medusajs.com) commerce apps in one workspace, sharing one core package, each app deployed on its own with Dokploy.

> **Status (2026-11-14):** every category has its code. Ecommerce and POS run on staging; no category is in production yet. **Next: the shared core** (`BUILD_PLAN.md` §5): the SC-1 proof, then the catalog and the core, one step per PR. Then the backlog (§10). Details: [`docs/TASKS.md`](./docs/TASKS.md).

Each category folder is one kind of business; each business running it is one Dokploy project. Inside a category, every app has its own `Dockerfile` and `.env.example` and deploys on its own.

| Category | Business | Apps (Dokploy Build Path) | Status |
|---|---|---|---|
| [`ecommerce/`](./ecommerce) | Direct-to-consumer online store | `/ecommerce/backend`, `/ecommerce/storefront` | on staging; production P1-08 open |
| [`pos/`](./pos) | Physical shop checkout | `/pos/backend`, `/pos/storefront`, `/pos/pos-app` | on staging; exit passed |
| [`booking-services/`](./booking-services) | Appointments, visits, trips, rentals, tickets, tables, event packages | `/booking-services/backend`, `/booking-services/storefront`, `/booking-services/provider-portal` | kinds A and G built, staging passed (P3-18); providers P3-31/P3-32 |
| [`wholesale/`](./wholesale) | Companies buy your products in bulk | `/wholesale/backend`, `/wholesale/storefront` | code done; staging P4-11 open |
| [`reseller/`](./reseller) | Sellers sell your products, you ship | `/reseller/backend`, `/reseller/storefront`, `/reseller/seller-portal` | code done; staging P5-11 open |
| [`marketplace/`](./marketplace) | Vendors sell their own products | `/marketplace/backend`, `/marketplace/storefront`, `/marketplace/vendor-portal` | code done; staging P6-13 open |

Each category's `README.md` is its Dokploy guide: services, build paths, ports, env and first-deploy order.

## Documents

At the root: this README, [`BUILD_PLAN.md`](./BUILD_PLAN.md) and [`CLAUDE.md`](./CLAUDE.md). The plan stays at the root because its lock (hook, checksum, CI guard) is tied to that path; Claude Code reads `CLAUDE.md` only from the root. Everything else is in [`docs/`](./docs).

- [`BUILD_PLAN.md`](./BUILD_PLAN.md): goals, glossary, architecture, **the shared core and its migration**, app standards, deploy and release, the six categories, build order and backlog. **Frozen.**
- [`CLAUDE.md`](./CLAUDE.md): builder entry point: reading order and non-negotiable rules.
- [`docs/TASKS.md`](./docs/TASKS.md): open tasks, decisions and live findings (the living tracker).
- [`docs/MEDUSA_SKILL.md`](./docs/MEDUSA_SKILL.md): verified Medusa reference (2.22.6 in every app) with sources; the only Medusa knowledge builders may use without a fresh lookup (skill `medusa-v2`).
- [`docs/DEV_FLOW.md`](./docs/DEV_FLOW.md): build → verify → test → evidence-based fix cycle → commit → push.
- [`docs/PRE_DEPLOY_AUDIT.md`](./docs/PRE_DEPLOY_AUDIT.md): the security and readiness audit to run per category before it goes live.
- [`docs/PLAN_LOCK.md`](./docs/PLAN_LOCK.md): owner's note: the commands to unlock and lock `BUILD_PLAN.md` for Claude.

Older history (the medusa-apps plan revisions, done tasks, closed findings, handovers and audit reports) is at tag `pre-shared-core`.

## Principles

1. **Official Medusa only.** Medusa is used as published npm packages. Nothing upstream is forked or patched.
2. **Shared code is written once.** Code several backends share lives in `packages/medusa-core`, used in library mode: each backend switches on only the features it uses. Clients reach their backend only over HTTP.
3. **Update any time, safely.** Medusa versions are set once in the root catalog; every PR runs the CI gate of every app; staging first, and production only when the owner moves the category's release branch.
4. **Independent deploys.** Every app keeps its own `package.json`, `Dockerfile`, `.env.example` and Dokploy app.
5. **One business = one category deployment.** Combine categories by adding modules to one backend, never by syncing two backends.

Versions (2026-11-12): Medusa 2.22.6 in every app (npm `latest`, a security release, as the starters), Node `>=22.23.4`, Next.js 16.4.5, pnpm 12.18.0. Details: `BUILD_PLAN.md` (Revision 1, 2026-11-14). Starters: `medusajs/dtc-starter`, `medusajs/b2b-starter`.
