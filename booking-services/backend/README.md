# booking-services / backend

Medusa **2.22.6** backend for the booking services category (appointments, classes, rentals; BUILD_PLAN §9.3). One image, deployed twice (server + worker). Standard: `BUILD_PLAN.md` §7.1. Medusa reference: `docs/MEDUSA_SKILL.md`.

**Copied from `ecommerce/backend` at `main` `26c3d97`** (TASKS Phase 3, owner 2026-11-04: full copy of Ecommerce, on the latest Medusa; F-044): PayWay, Resend, Telegram, Cambodia contact rules, anti-abuse, account emails, admin 2FA, wishlist and upload limits work the same here. Booking features are added on top from P3-01. Done so far: module `booking` (`src/modules/booking`, P3-01): `booking_resource` (staff, room, equipment or venue, with capacity and IANA time zone), `booking_schedule` (weekly hours as `"HH:MM"` in the resource's zone, 0 = Sunday) and `booking` (UTC times, status, hold expiry, customer, cart and line item), with database checks (TASKS F-045); links resource ↔ product variant (which services a resource offers, many-to-many) and booking → order (`src/links/booking-*.ts`, P3-02). The service checks a slot (`checkSlot` / `isSlotAvailable`: opening hours in the resource's zone, peak overlap against capacity, holds count until they expire) and creates holds (`createHold`, row-locked against double booking, `BOOKING_HOLD_MINUTES`; P3-03). The `add-booking-to-cart` workflow (`src/workflows/add-booking-to-cart.ts`, P3-04) creates the hold and its line item together (quantity 1, booking details in the item's `metadata`) and rolls the hold back if the line item can't be added. Cart hooks (`src/workflows/hooks/booking-cart.ts`, P3-05) keep carts honest: a service (a variant a resource offers) only goes in with a held time, a booking item matches its hold and stays at quantity 1, and checkout re-checks every slot without changing the cart. Starting a payment renews the cart's holds for `BOOKING_HOLD_MINUTES` (middleware on the payment-session route + `extend-booking-holds` workflow, P3-06), unless the slot was taken meanwhile. When the order is placed, the `order.placed` subscriber confirms its bookings and links them to the order (`confirm-order-bookings` workflow, idempotent, P3-07). `cancel-booking` (P3-08) cancels a hold or a confirmed booking before it starts and refunds the booking's order item when cancelled at least `BOOKING_CANCEL_HOURS` (default 24) before the start, from a captured payment, with an idempotency key. Jobs (P3-09): `release-expired-booking-holds` every minute marks run-out holds `expired`; `send-booking-reminders` every 15 minutes emails a reminder once per confirmed booking in the next 24 hours (`booking-reminder` email template). Store routes (P3-10): `GET /store/booking/availability`, `GET /store/booking/slots` (free slots per service and local date), `POST /store/booking/cart` (hold + add to cart) and `POST /store/booking/cancel` (signed-in customer). Admin (P3-11): page **Bookings** (`/app/bookings`, day / week calendar per resource in its time zone, walk-in form, cancel) and `/admin/booking/resources` (create / update a resource with its weekly hours and services) and `/admin/booking/bookings` (calendar data, walk-in, cancel). Services are products without a shipping profile and with Manage inventory off; `pnpm seed:booking-demo` creates one (P3-12). **Review 2 (2026-11-12):** an order's bookings are confirmed in the booking module under the resource lock (`confirmBookings`): a hold that ran out is kept when its time is still free, and one whose time was taken is logged as an error for staff instead of overbooking; the release job skips holds whose cart already became an order (S4). A cancelled order cancels its bookings (`booking-order-canceled` subscriber, `release-order-bookings` workflow, no second refund; S5). The PayWay page closes a minute before the hold ends (M1). The ecommerce notes below apply unchanged.

Still in force from the copy and the starter (plan §7.1):
- Part of the root pnpm workspace: no own lockfile; `@medusajs/*` come from the root catalog (**2.22.6**, `"catalog:"`); pnpm from the root `packageManager`. Shared code (PayWay, seeds, …) comes from `packages/medusa-core` in library mode.
- Env-driven `medusa-config.ts`: Redis modules (caching, event bus, workflow engine, locking), S3, worker mode, admin, `DATABASE_SSL`.
- The starter's demo seed lives in `src/scripts/seed-initial-data.ts` (not a migration script), run by hand; it reuses Medusa's first-boot store, sales channel and key (TASKS F-017) and keeps the store's default currency (F-101). Not used for this shop.
- Scripts `typecheck`, `predeploy` (safe migrate flags), `seed:*`.

## Run locally
```bash
docker compose -f ../docker-compose.local.yml up -d postgres redis   # docker = Kiri
cp .env.example .env    # then set DATABASE_URL=postgres://medusa:medusa@localhost:55432/booking_services etc.
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
pnpm seed:booking-demo                      # booking-only demo: a service per booking kind (A to G: Haircut, Air conditioner service, Moving truck, Airport transfer, bus and tour, tent and room, dance show, Table reservation) and their categories, plus extras, passes, quote and packages (TASKS P3-19)
pnpm seed:initial                           # NOT for this shop: the starter's goods demo (EU region, demo products); kept for tests
```

## Verify (DEV_FLOW §5)
```bash
pnpm build && pnpm typecheck
DB_HOST=localhost DB_PORT=55432 DB_USERNAME=medusa DB_PASSWORD=medusa pnpm test:integration:http
docker build -f Dockerfile -t booking-services-backend:check ../..   # context: the repo root
```

## Deploy
Dokploy (server and worker, same image): Build Path `/`, Docker File `booking-services/backend/Dockerfile`, Docker Context Path `.`, Watch Paths `booking-services/backend/**`, `packages/medusa-core/**`, `pnpm-workspace.yaml`, `package.json`, `pnpm-lock.yaml`. Optional build args (the Dockerfile's `ARG`s): `MEDUSA_BACKEND_URL` (empty when the admin is served by this app) and `UPLOAD_MAX_FILE_SIZE_CEILING_MB` (empty = 5; keep equal to the runtime value). Env: `.env.example`. Keep `DATABASE_SSL=false` for the Dokploy internal Postgres. Order of steps: `../README.md`.
