# Booking staging from zero (`medusa-platform`)

The short, start-to-finish setup of a Booking **staging** project in Dokploy, built from the `medusa-platform` repo with the shared-core method: root pnpm workspace, Docker Context Path `.` (BUILD_PLAN.md §5.3, §7, §8.1). It's the same path as `ecommerce/STAGING_QUICKSTART.md` and `pos/STAGING_QUICKSTART.md`, for a **booking-only** shop (TASKS P3-19): services by booking kind, no demo goods. Do the parts in order; each ends with a **Check**. This is TASKS **P3-18**.

The full runbook, [DOKPLOY_STAGING.md](./DOKPLOY_STAGING.md), has the background, the optional extras (S3, Resend, Telegram, PayWay), the independence test and troubleshooting.

**Never paste secret values** in chat, git or tickets. When you share a log, filter it first: `grep -v -i "secret\|access-key\|api_key"`.

---

## Part A: Prepare (10 min)

**A1. Repo access.** Dokploy already reads `medusa-platform` (Ecommerce and POS staging use it). Nothing to do.

**A2. Two hostnames**, each an **A record** to the Dokploy server (the same IP as Ecommerce and POS staging):
- `<api host>`: backend and admin (e.g. `api-booking-stg.<your-domain>`)
- `<shop host>`: the booking shop (e.g. `shop-booking-stg.<your-domain>`)

If an older Booking staging project already uses hostnames you want to keep, that's fine: Part G moves them.

**A3. Five secrets.** Run `openssl rand -hex 32` five times and keep them in your password manager:

| Name | Used as | On |
|---|---|---|
| A | `JWT_SECRET` | backend, worker |
| B | `COOKIE_SECRET` | backend, worker |
| C | `AUTH_MFA_ENCRYPTION_KEY` (never change it later) | backend, worker |
| D | `REVALIDATE_SECRET` | backend, worker, storefront |
| E | `SHOPPER_IP_SECRET` | backend, worker, storefront |

**A4. Your shop's name**, shown in the shop's header, footer and page titles (e.g. "Siem Reap Spa"). Empty = "Book Online".

S3, Resend, Telegram and PayWay are optional: every booking check works without them (customers then pay with the built-in manual payment). If you add them, use Booking's own bucket and Telegram group, not Ecommerce's (runbook Step 0.C, Step 2.B extras). PayWay is worth adding if you have the Ecommerce sandbox values: Part H then also tests a card payment and the refund on cancel.

**Check:** you have two hostnames, five secrets and a shop name.

---

## Part B: Project and databases (5 min)

1. Dokploy → **Projects** → **Create Project** → a name no other project uses (e.g. `booking-stg`).
2. **Create Service → Database → Postgres**: name `booking-postgres`, Database Name `booking_services` → **Create** → **Deploy**. Copy its **Internal Connection URL**. Leave External Credentials **off**.
3. **Create Service → Database → Redis**: name `booking-redis` → **Deploy**. Copy its **Internal Connection URL**.

**Check:** both services are green.

---

## Part C: Backend server `booking-backend` (15 min)

1. **Create Service → Application** → `booking-backend`.
2. **Provider: GitHub**: Repository `medusa-platform`, Branch `main`, Build Path `/`, Trigger On Push → **Save**.
3. **Build Type**: Dockerfile, Docker File `booking-services/backend/Dockerfile`, Docker Context Path `.`, Build Stage empty → **Save**.
4. **Watch Paths**, one per line:
   ```
   booking-services/backend/**
   packages/medusa-core/**
   pnpm-workspace.yaml
   package.json
   pnpm-lock.yaml
   ```
5. **Environment Variables** (the runtime box; fill every `<…>`):
   ```
   NODE_ENV=production
   PORT=9000
   DATABASE_URL=<Postgres Internal Connection URL>
   DATABASE_SSL=false
   REDIS_URL=<Redis Internal Connection URL>
   MEDUSA_FF_CACHING=true
   JWT_SECRET=<A>
   COOKIE_SECRET=<B>
   AUTH_MFA_ENCRYPTION_KEY=<C>
   STORE_CORS=https://<shop host>
   ADMIN_CORS=https://<api host>
   AUTH_CORS=https://<api host>,https://<shop host>
   MEDUSA_BACKEND_URL=
   DISABLE_MEDUSA_ADMIN=false
   MEDUSA_WORKER_MODE=server
   RUN_MIGRATIONS=true
   STOREFRONT_URL=https://<shop host>
   REVALIDATE_SECRET=<D>
   SHOPPER_IP_SECRET=<E>
   CLIENT_IP_HEADER=
   BOOKING_HOLD_MINUTES=15
   BOOKING_DEFAULT_TIMEZONE=Asia/Phnom_Penh
   BOOKING_CANCEL_HOURS=24
   ```
   `DATABASE_URL` must start with `postgres`, `REDIS_URL` with `redis` (F-012). The last three: a chosen time is held 15 minutes while the customer pays, opening hours are in Phnom Penh time, and a booking cancelled at least 24 hours before its start is refunded. Leave **Build-time Arguments** empty. Optional extras: runbook Step 2.B.
6. **Domains → Add Domain**: `<api host>`, Path `/`, Container Port **9000**, HTTPS on.
7. **Swarm Settings:**
   - **Health Check:** exactly two boxes: `CMD-SHELL` and `node -e "fetch('http://localhost:9000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`. Interval `30000000000`, Timeout `10000000000`, Start Period `120000000000`, Retries `3`.
   - **Update Config:** Parallelism `1`, Delay `10000000000`, Failure Action **Rollback**, Monitor `10000000000`, Max Failure Ratio `0`, Order **Start First**. The dropdowns may show "Select…" after saving; the values are stored (F-020).
   - **Replicas:** `1`.
8. **Deploy** (about 5–10 minutes).

**Check:** `https://<api host>/health` shows `OK`. If you're reusing hostnames that another project still serves, use a **Generated** domain until Part G.

---

## Part D: Admin, booking data, store currency, key (10 min)

1. `booking-backend` → **Terminal**:
   ```bash
   docker-entrypoint.sh medusa user -e <your-email> -p '<a strong password>'
   docker-entrypoint.sh medusa exec ./src/scripts/seed.js
   docker-entrypoint.sh medusa exec ./src/scripts/seed-booking-demo.js
   ```
   - The first seed adds the Cambodia region (USD), the Phnom Penh location and its delivery option.
   - The second adds one example per booking kind, each in its category: **Haircut** (Appointments) with the stylist **Sophea**, Monday to Saturday 09:00–12:00 and 13:00–17:00; **Table reservation** (Table reservations) by party size 2, 4 or 6, a $5 deposit, every day 11:00–14:00 and 17:00–22:00. It ends with `Booking demo: service "Table reservation" with Tables for 2 (4), Tables for 4 (3), Table for 6 (1) created.`
   - Don't run `seed-initial-data.js` here: it adds demo goods and a Europe region, which this shop doesn't have.
2. Admin `https://<api host>/app` → **Settings → Store**: **Default currency USD**, **Default region Cambodia**. The services have USD prices only (F-086).
3. **Settings → Publishable API Keys** → the one key → it must list exactly **one** sales channel, **Default Sales Channel** → copy its `pk_…` token.
4. **With PayWay only:** **Settings → Regions → Cambodia → Payment providers** → add **payway** → **Save**.

**Check:** you can sign in; **Products** lists exactly **Haircut** and **Table reservation**; **Products → Categories** lists **Appointments** and **Table reservations**; the sidebar shows **Bookings**; the store currency is USD.

---

## Part E: Worker `booking-worker` (5 min)

1. **Create Service → Application** → `booking-worker`.
2. Provider and Build Type as C2 and C3 (Docker File `booking-services/backend/Dockerfile`, Context Path `.`); Watch Paths as C4.
3. **Environment:** the backend's whole block, with three lines changed:
   ```
   MEDUSA_WORKER_MODE=worker
   DISABLE_MEDUSA_ADMIN=true
   RUN_MIGRATIONS=false
   ```
4. **No domain, no health check.** Update Config as the backend's, Order **Stop First**.
5. **Deploy** after the backend is healthy.

**Check:** Logs show `Starting Medusa (worker mode: worker)` and `Server is ready`, no errors. The worker releases expired holds every minute, sends the reminders and keeps the shop's search up to date.

---

## Part F: Online shop `booking-storefront` (10 min)

1. **Create Service → Application** → `booking-storefront`. Provider as C2. Build Type: Docker File `booking-services/storefront/Dockerfile`, Context Path `.`.
2. **Watch Paths:** `booking-services/storefront/**`, `pnpm-workspace.yaml`, `package.json`, `pnpm-lock.yaml`.
3. **Build-time Arguments** (built into the shop's code; changing one later means **Rebuild**):
   ```
   NEXT_PUBLIC_MEDUSA_BACKEND_URL=https://<api host>
   NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=<pk_… from Part D>
   NEXT_PUBLIC_BASE_URL=https://<shop host>
   NEXT_PUBLIC_DEFAULT_REGION=kh
   NEXT_PUBLIC_SHOP_NAME=<your shop's name from A4>
   NEXT_PUBLIC_STRIPE_KEY=
   NEXT_PUBLIC_CAPTCHA_PROVIDER=
   NEXT_PUBLIC_CAPTCHA_SITE_KEY=
   S3_IMAGE_HOSTNAME=
   S3_IMAGE_PATHNAME=/**
   ```
   A typo in any of these shows up later only as a 500 on every page (F-016), so check them twice.
4. **Environment Variables** (the runtime box: the shop's server reads these while it runs):
   ```
   NODE_ENV=production
   PORT=8000
   MEDUSA_BACKEND_URL=https://<api host>
   REVALIDATE_SECRET=<D>
   SHOPPER_IP_SECRET=<E>
   CLIENT_IP_HEADER=
   ```
5. **Swarm:** Health Check two boxes, `CMD-SHELL` and `node -e "fetch('http://localhost:8000/favicon.ico').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`, Start Period `60000000000` (other values as the backend); Update Config as the backend.

Don't deploy yet if `<shop host>` still belongs to another project: Part G moves it first.

**Check:** the app is saved.

---

## Part G: Domains and go live (10 min)

1. If the hostnames belong to an older Booking project, remove them from its apps' **Domains** and **stop** those apps (keep them as the way back until Part H passes).
2. Add the domains: `booking-backend` `<api host>` → port **9000** (if not done in C6); `booking-storefront` `<shop host>` → port **8000**; HTTPS on.
3. **Redeploy** `booking-backend`, then **Deploy** `booking-storefront`.

**Check:**

| Check | Pass |
|---|---|
| `https://<api host>/health` | `OK` |
| `https://<api host>/app/` | the admin |
| `https://<shop host>/` | redirects to `/kh`: your shop name, "Choose a service, pick a free time and book it online.", then **Appointments** (Haircut) and **Table reservations** (Table reservation), each with a **Book** button |
| the shop's footer | your shop name and the two kinds; no "Medusa", GitHub or "Powered by" |
| server: `docker ps --filter name=booking- --format '{{.Names}} {{.Status}}'` | backend and storefront `(healthy)`, worker `Up` |

---

## Part H: The real test (20 min)

1. **Account:** in the shop, **Account** → join with an email you can read → confirm it (with Resend: the link in the email; without: `booking-worker` → **Logs** → search `verify-account` → open that link) → sign in. A guest can book too, but only a signed-in customer can cancel online.
2. **Table (kind G):** home page → **Table reservations** → **Book** → **Party size** `4 people` → a **Day** at least two days ahead → a **Time** (e.g. 18:30) → **Book 18:30**. The cart shows the table, the day and time, $5.00, and **no shipping line**.
3. **Checkout:** **Go to checkout** → your details (no address or delivery step) → **Continue to payment** → PayWay sandbox card (**Mastercard 5156 8399 3770 6777**, exp **01/30**, CVV **993**) or the manual payment → **Confirm booking**. The page says **"Your booking is confirmed."** Note the **order number**.
4. **Haircut (kind A):** home page → **Appointments** → Haircut → **Book** → **Length** `30 min`, a weekday two days ahead, a time → book and pay the same way.
5. **Admin:** **Bookings** → **Tables for 4** on the table's day: the booking at its time. **Sophea** on the haircut's day: the haircut. **Walk-in booking** for Sophea at another time that day, Minutes `30` → "Walk-in booked."
6. **Capacity:** back in the shop, the table's day and time still offers **Tables for 4** (3 of the 4 tables are free); the haircut's time is gone.
7. **Cancel:** **Account → Bookings** → the haircut under **Upcoming** → **Cancel**. It moves to **Past and cancelled**, and the time is free again in the shop. With PayWay, the start is more than 24 hours away, so the order shows a **refund** in the admin.

**Check:** two bookings with order numbers, the walk-in on the calendar, the cancelled time free again; with PayWay, the refund. Reply with the order numbers and "booked, walk-in, cancelled" (or what went wrong at which step), plus the two hosts and the `pk_…` key, so I can run the runbook's Step 7 checks from here.

---

## Afterwards

- **Each app redeployed alone** (independence): runbook Step 8.
- **Troubleshooting:** runbook Step 9.
- **Results** go into `docs/TASKS.md` → P3-18; then the old Booking staging project (if any) can be deleted.
