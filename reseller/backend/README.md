# reseller / backend

Medusa **2.22.6** backend for the reseller category (sellers sell your products on their own domains, you ship; BUILD_PLAN §9.5). One image, deployed twice (server + worker). Standard: `BUILD_PLAN.md` §7.1. Medusa reference: `docs/MEDUSA_SKILL.md`.

**Copied from `ecommerce/backend` at `main` `847465d`** (TASKS Phase 5, owner 2026-11-10: "1" = full copy of Ecommerce; F-061), tracked files only: PayWay, Resend, Telegram, Cambodia contact rules, anti-abuse, account emails, admin 2FA, wishlist and upload limits work the same here.
- Package `reseller-backend`; the Dockerfile, entrypoint, `.env.example` and comments name `reseller/*` (database `reseller`, `reseller-postgres`, `reseller-redis`).
- `.env.example` gains the plan §9.5 settings: `RESELLER_DEFAULT_COMMISSION_RATE`, `RESELLER_PAYOUT_DAY`, `SELLER_CORS` (read from P5-03 / P5-04 / P5-05 on).
- Local stack: `../docker-compose.local.yml` (same host ports as the other categories; run one at a time).

**P5-01:** module `seller` (`src/modules/seller`): `seller` (handle, name, email, domain, status, commission rate) and `seller_commission` (one per order). **P5-02:** each seller has one sales channel (`src/links/seller-sales-channel.ts`); `createSellerWorkflow` creates the seller with the channel, its publishable key and the stock-location links. **P5-03:** seller login (actor type `seller`, invite-only like POS cashiers): the shop invites with `POST /admin/sellers`, the seller registers at `/auth/seller/emailpass/register`, accepts at `POST /sellers/accept` and signs in at `/auth/seller/emailpass`; every `/sellers/*` route needs a signed-in seller who isn't suspended and passes `SELLER_CORS` (`src/api/seller-auth.ts`); `GET /sellers/me`. **P5-04:** commissions: `order.placed` → `recordSellerCommissionWorkflow` (one per order, locked; only active sellers; the seller's rate or `RESELLER_DEFAULT_COMMISSION_RATE`); `order.canceled` cancels it; `payment.refunded` recalculates it on what the shop kept (`src/modules/seller/commission.ts`, F-063). Amounts and totals round to the currency's minor units (KHR whole riel, USD cents; owner 2026-11-25). **P5-05:** payouts: on `RESELLER_PAYOUT_DAY` the daily job `seller-payout-batch` approves last month's pending commissions; `GET /admin/seller-payouts` shows what is due; after paying a seller outside Medusa, `POST /admin/sellers/:id/payouts` marks their approved commissions paid (F-064). **P5-06:** seller routes: `GET /sellers/me/products` (your published products, `selected` when in the seller's channel), `POST /sellers/me/products` (`add` / `remove`, your published products only), `GET /sellers/me/commissions` (own, newest first, with totals). **P5-07:** `GET /store/sellers/resolve?domain=|handle=` gives the storefront an active seller's publishable key. **P5-08:** `GET /sellers/me/orders` for the seller portal (`../seller-portal`): orders in the seller's channel with their commission, no customer details. **F-081:** the admin **Sellers** page (`src/admin/routes/sellers`) invites a seller (active at once) and shows their invite code; `POST /admin/sellers/:id` (`updateSellerWorkflow`) activates or suspends a seller and changes their name, domain (one per seller, also checked on invite) or commission rate. Only an active seller's domain shows their shop and earns commissions; suspending signs them out at once. The ecommerce notes below apply unchanged.

---

Still in force from the Ecommerce copy and the starter (plan §7.1):
- Part of the root pnpm workspace: no own lockfile; `@medusajs/*` come from the root catalog (**2.22.6**, `"catalog:"`); pnpm from the root `packageManager`. Shared code (PayWay, seeds, …) comes from `packages/medusa-core` in library mode.
- Env-driven `medusa-config.ts`: Redis modules (caching, event bus, workflow engine, locking), S3, worker mode, admin, `DATABASE_SSL`.
- The starter's demo seed lives in `src/scripts/seed-initial-data.ts` (not a migration script), run by hand; it reuses Medusa's first-boot store, sales channel and key (TASKS F-017) and keeps the store's default currency (F-101).
- Scripts `typecheck`, `predeploy` (safe migrate flags), `seed:*`.

## Run locally
```bash
docker compose -f ../docker-compose.local.yml up -d postgres redis   # docker = Kiri
cp .env.example .env    # then set DATABASE_URL=postgres://medusa:medusa@localhost:55432/reseller etc.
pnpm install --frozen-lockfile
pnpm medusa db:migrate --execute-safe-links --execute-safe-search
pnpm dev                                    # http://localhost:9000/app
pnpm medusa user -e admin@example.com -p <password>
# Product images (TASKS P1-11): upload JPEG (quality ~80), PNG or WebP, about 1600 px on
# the longest side, max 0.8 MB (≈ 800 KB) by default; admins change the limit in Settings → Store (up to
# UPLOAD_MAX_FILE_SIZE_CEILING_MB, default 5, also a build arg); SVG is rejected. The shop serves images
# as uploaded, so smaller files load faster for customers.
# Notifications (TASKS P1-04): order.placed → customer email (Resend) + staff alert (Telegram).
# Without RESEND_API_KEY / TELEGRAM_BOT_TOKEN both channels only log (notification-local).
# Customer updates on Telegram (TASKS P1-17): a separate customer bot; the order page links to it,
# the customer taps Start, the bot confirms the order and reports shipped / delivered / canceled.
# Env TELEGRAM_CUSTOMER_*, webhook POST /telegram/webhook, setup: src/scripts/telegram-set-webhook.ts.
# Payments (TASKS P1-03): ABA PayWay provider pp_payway_payway (from the shared core: packages/medusa-core, providers/payway) when PAYWAY_MERCHANT_ID
# and PAYWAY_API_KEY are set; callback /hooks/payment/payway_payway; add it to the region in the admin.
# Refunds (and cancelling a paid order) go through PayWay's Refund API with PAYWAY_RSA_PUBLIC_KEY.
pnpm seed                                   # real shop: Cambodia region (USD + KHR), tax region, Phnom Penh delivery (TASKS P1-02)
pnpm seed:initial                           # optional demo data (EU region, demo products); keeps USD as default (F-101)
```

## Verify (DEV_FLOW §5)
```bash
pnpm build && pnpm typecheck
DB_HOST=localhost DB_PORT=55432 DB_USERNAME=medusa DB_PASSWORD=medusa pnpm test:integration:http
docker build -f Dockerfile -t reseller-backend:check ../..   # context: the repo root
```

## Deploy
Dokploy (server and worker, same image): Build Path `/`, Docker File `reseller/backend/Dockerfile`, Docker Context Path `.`, Watch Paths `reseller/backend/**`, `packages/medusa-core/**`, `pnpm-workspace.yaml`, `package.json`, `pnpm-lock.yaml`. Optional build args (the Dockerfile's `ARG`s): `MEDUSA_BACKEND_URL` (empty when the admin is served by this app) and `UPLOAD_MAX_FILE_SIZE_CEILING_MB` (empty = 5; keep equal to the runtime value). Env: `.env.example`. Keep `DATABASE_SSL=false` for the Dokploy internal Postgres. Order of steps: `../README.md`.
