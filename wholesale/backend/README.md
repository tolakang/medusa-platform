# wholesale / backend

Medusa **2.22.6** backend for the wholesale (B2B) category. One image, deployed twice (server + worker). Standard: `BUILD_PLAN.md` §7.1, category: §9.4. Medusa reference: `docs/MEDUSA_SKILL.md`.

**Starter:** `medusajs/b2b-starter` `apps/backend` at commit **`47eecab`** (2026-11-05, Medusa 2.22.3, the last starter commit on 2.22.3; the starter moved to 2.22.4 and 2.22.6 on 2026-11-09, TASKS F-055). Modules from the starter: `company` (+ `employee`), `quote`, `approval`, with their links, workflows, hooks, API routes and admin pages. Changes from the starter (TASKS P4-01):
- Medusa **2.22.6** (the starter's 2.22.4 and 2.22.6 commits only bump versions).
- Part of the root pnpm workspace: name `wholesale-backend`, no own lockfile; `@medusajs/*` come from the root catalog (`"catalog:"`); pnpm from the root `packageManager`. The starter's monorepo used `node-linker=hoisted`, which let it import packages it never declared; these are now direct dependencies at the versions the starter's lockfile resolved: `date-fns` 4.4.0 (admin), `jsonwebtoken` 9.0.3, `@types/jsonwebtoken` 9.0.10 and `scrypt-kdf` 2.0.1 (tests). `@medusajs/eslint-plugin`, `eslint`, `jiti` moved here from the starter's root. `@medusajs/ui` from the catalog like the other backends (F-006).
- Env-driven `medusa-config.ts`: the same infrastructure block as `ecommerce/backend` (Redis modules: caching + `@medusajs/caching-redis`, event bus, workflow engine, locking; S3; worker mode; admin; `DATABASE_SSL`; `SESSION_COOKIE_SECURE`) plus the starter's three modules.
- `src/migration-scripts/initial-data-seed.ts` moved to `src/scripts/seed-initial-data.ts` (F-002) and reuses the store, sales channel and publishable key Medusa creates on first boot (F-017; keeps the store's default currency, F-101; test `integration-tests/http/seed-initial-data.spec.ts`). `src/migration-scripts/region-store-policies.ts` stays: it only fills missing store-policy metadata on existing regions.
- Repo rules (DEV_FLOW Gate 5): `@medusajs/core-flows` imports → `@medusajs/medusa/core-flows`; the two admin `zod` imports → `@medusajs/framework/zod`; the six `as any` removed (three were not needed; `update-order` takes the `OrderStatus` type; `checkSpendingLimit`, `getSpendWindow` and `computeShippingOptionTargets` take only the fields they read, so query results fit).
- Starter type errors fixed (the starter has no `typecheck`): unneeded cast in the admin quote items list; `inApp` removed from the test runner options (not an option in `@medusajs/test-utils` 2.22.3); test JWT falls back to Medusa's default secret.
- Starter tests brought up to 2.22.3: the test product is `published` (carts reject draft products' variants) and the quote summary no longer expects `difference_sum` (not in `OrderSummaryDTO`). Added `health.spec.ts` and `seed-initial-data.spec.ts` from ecommerce.
- Not copied: `.env.template`, `.npmrc`, `.vscode/`, `static/` (demo images; the seed uses Medusa's public image URLs), the generic `README.md` guides under `src/` and `integration-tests/http/` (F-053).
- P4-02: `company` gains `payment_terms`, `credit_limit`, `tax_id`, `status` (admin API and admin form; buyers may set only `tax_id`); `POST /store/companies/:id` now validates its body (F-058).
- P4-03: `src/scripts/seed-b2b.ts` (`seed:b2b`): the B2B sales channel and its publishable key; with `demo-pricing`, Gold / Silver customer groups, price lists on `customer.groups.id` and quantity tiers. A company gets a tier by joining a customer group (admin: company → customer group). Every run ends by rebuilding the product search index (F-102).
- P4-04: B2B cart rules (`src/utils/b2b-cart-rules.ts`, hooks in `src/workflows/hooks/`): only employees of an approved company add to cart or check out; minimum order quantity from `metadata.min_order_quantity` (variant, else product); spending limit over the company's reset window with past orders; credit limit for net-terms companies (unpaid orders count until captured).
- P4-05: approvals above a limit: `approval_settings.approval_threshold` (admin only); checkout needs every required approval; items lock while pending or approved; only the cart's buyer asks and only an admin of the same company decides (the sales manager in the admin); carts and orders link to the buyer's company from the employee record; one company has many orders; accepting a quote runs the checkout rules (F-059).
- P4-07: store company API scoped to the buyer (F-058): `/store/companies/me`, `/me/employees`, `/me/approval-settings` replace the starter's `/store/companies/:id…`; sign-up (`POST /store/companies`) creates the company and its first admin together, `pending` when `WHOLESALE_REQUIRE_APPROVAL=true`; quote and approval routes only for the own customer or company.
- P4-06: invoices: module `invoice` (`INV-000001`, company / tax ID / terms snapshot, due date from the payment terms), created on `order.placed`; PDF (`pdfmake`, tutorial pattern) at `GET /admin/orders/:id/invoice` (admin widget on the order page) and `GET /store/orders/:id/invoice` (the buyer or their company admin); `GET /store/invoices` with what is still due. Net-terms orders are captured in the admin when the invoice is paid. Seller details: `INVOICE_SELLER_*` env.
- Review 2 (2026-11-12): accepting a quote turns the draft into an order with core `convertDraftOrderWorkflow`, so every item reserves stock and the order emits `order.placed` (S3); `/store/collections` needs an approved buyer when `fields` asks for products, because collections can return every tier price (A2); starting a PayWay payment runs the same checkout rules as cart completion (approvals, minimums, spending and credit limits), since PayWay takes the money first (M3, `src/utils/assert-cart-can-be-placed.ts`).
- `jest.config.js` ignores `<rootDir>/.medusa/` (F-060).
- Scripts added: `typecheck`, `predeploy` (safe migrate flags), `seed:initial`, `--passWithNoTests` on module and unit tests.

Known starter behaviour left for later tasks: module tables have no prefix (`company`, `quote`, `message`, …; F-055).

## Run locally
```bash
cp .env.example .env    # then set DATABASE_URL, REDIS_URL, CORS for your local Postgres/Redis
pnpm install --frozen-lockfile
pnpm medusa db:migrate --execute-safe-links --execute-safe-search
pnpm dev                                    # http://localhost:9000/app (Companies, Quotes, Approvals)
pnpm medusa user -e admin@example.com -p <password>
pnpm seed:initial                           # optional demo data (EU region, demo products); after the first start
pnpm seed:b2b                               # "Wholesale" channel + its publishable key (prints it; safe in production); rebuilds the search index (F-102)
pnpm seed:b2b demo-pricing                  # + Gold / Silver groups and price lists with volume tiers (demo)
```

## Verify (DEV_FLOW §5)
```bash
pnpm build && pnpm typecheck
DB_HOST=localhost DB_PORT=5432 DB_USERNAME=medusa DB_PASSWORD=medusa pnpm test:integration:http
docker build -f Dockerfile -t wholesale-backend:check ../..   # context: the repo root
```

## Deploy
Dokploy (server and worker, same image): Build Path `/`, Docker File `wholesale/backend/Dockerfile`, Docker Context Path `.`, Watch Paths `wholesale/backend/**`, `packages/medusa-core/**`, `pnpm-workspace.yaml`, `package.json`, `pnpm-lock.yaml`. Optional build arg (the Dockerfile's only `ARG`): `MEDUSA_BACKEND_URL` (empty when the admin is served by this app). Env: `.env.example`. Keep `DATABASE_SSL=false` for the Dokploy internal Postgres. Order of steps: `../README.md`.

**Search index (F-102):** adding products to the Wholesale channel in the admin doesn't update the search index. Re-run `seed-b2b` once after that, and once on any staging seeded before 2026-11-25:
```bash
docker-entrypoint.sh medusa exec ./src/scripts/seed-b2b.js
```
