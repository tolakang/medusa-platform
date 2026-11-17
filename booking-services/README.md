# Booking Services — `booking-services/`

> **Appointments, classes, tickets, rentals.** Phase 3 code done (P3-01 to P3-17); the exit checklist (P3-18, with a staging run) waits for the owner. Scope: [BUILD_PLAN.md §9.3](../BUILD_PLAN.md).
>
> `backend/` and `storefront/` are a **full copy of `ecommerce/`** (owner, 2026-11-04; TASKS F-044), started on Medusa 2.22.2, now **2.22.6** like every app (TASKS V-06). They build and run as a working Cambodia shop (PayWay, Telegram, email, contact rules). Booking features are added from P3-01 on. Local stack: `docker-compose.local.yml` (same host ports as the other categories, so run one stack at a time).

**Staging:** step-by-step setup from zero on `medusa-platform`: **[STAGING_QUICKSTART.md](./STAGING_QUICKSTART.md)** (Parts A–H). Full reference: [`DOKPLOY_STAGING.md`](./DOKPLOY_STAGING.md) (TASKS P3-18).

This folder is **one complete category**. Copy the whole folder's setup into one Dokploy project and every piece deploys on its own.

```
booking-services/
├── README.md                <- this guide
├── backend/                 Medusa server + worker
│   ├── Dockerfile
│   ├── docker-entrypoint.sh
│   └── .env.example
├── storefront/              customer storefront
│   ├── Dockerfile
│   └── .env.example
└── provider-portal/         staff and partners (TASKS P3-32)
    ├── Dockerfile
    └── .env.example
```

## Dokploy project: `booking-services`

| Service | Type | Build Path | Port → example domain | Env source |
|---|---|---|---|---|
| `booking-services-postgres` | Dokploy **PostgreSQL** | — | — | database `booking_services` |
| `booking-services-redis` | Dokploy **Redis** | — | — | — |
| `booking-services-backend` | Application (Dockerfile) | `/booking-services/backend` | 9000 → `api.example.com` | `backend/.env.example`, `MEDUSA_WORKER_MODE=server` |
| `booking-services-worker` | Application (Dockerfile) | `/booking-services/backend` | none | same env + worker overrides |
| `booking-services-storefront` | Application (Dockerfile) | `/booking-services/storefront` | 8000 → `shop.example.com` | `storefront/.env.example` (build args + runtime) |
| `booking-services-provider-portal` | Application (Dockerfile) | `/booking-services/provider-portal` | 3000 → `providers.example.com` | `provider-portal/.env.example`; the backend's `PROVIDER_CORS`, `PROVIDER_PORTAL_URL` and `AUTH_CORS` get its URL |

Every application uses **Build Type: Dockerfile** with **Build Path `/`**, **Docker File** `booking-services/<app>/Dockerfile` and **Docker Context Path** `.` (the repo root, since SC-1: the apps are in the root pnpm workspace; paths relative to the repo root, F-011), and **watch paths** `booking-services/<app>/**` plus the root `pnpm-workspace.yaml`, `package.json`, `pnpm-lock.yaml`, so a change to one app never redeploys another; a Medusa catalog change redeploys all of them. The "Build Path" column above is the app folder, not the Dokploy Build Path field.

### Shared core and release branches (plan §4–§5)

**Build from the repo root.** Booking services moved in its SC-1 PR (`docs/TASKS.md` → *Shared core*). For each app (`backend`, `storefront`, `provider-portal`) and the worker, in Dokploy:
- **Repository:** `medusa-platform` (General → Provider: GitHub; Branch `main`). Projects created for the old `medusa-apps` repo get no changes from this repo until this is switched; if the repo isn't in the dropdown, give the Dokploy GitHub App access to it first (GitHub → Settings → Applications → Installed GitHub Apps → Configure → Repository access).
- **Docker File:** `booking-services/<app>/Dockerfile` (unchanged).
- **Docker Context Path:** `.` (the repo root) instead of `booking-services/<app>`.
- **Watch Paths:** `booking-services/<app>/**` (the worker: `booking-services/backend/**`) plus `pnpm-workspace.yaml`, `package.json`, `pnpm-lock.yaml` (the root files of the workspace). Since SC-2 (PayWay moved into the core) the backend and the worker also watch `packages/medusa-core/**`.
- **When to switch:** once that app's SC-1 PR is green, change these fields and save **without** redeploying; then the PR merges and staging builds with the new fields. If a build fails, set the fields back and redeploy: the old image keeps running until then.

**Staging and production branches** (SC-3, before this category's first production deploy):
- **Staging** apps keep **Branch `main`**: every merge redeploys the changed apps.
- **Production** apps use **Branch `release/booking-services`**, Trigger **On Push**. Only you move it; Claude never does.
- **Release** (after checking staging), from your own terminal:
  ```bash
  git fetch origin && git push origin origin/main:refs/heads/release/booking-services
  ```
  To release an older checked commit instead, put its hash in place of `origin/main`.
- **Release order** (plan §8.2, D15): a change that reaches several categories (Medusa, pnpm, Node, the core) goes to production Ecommerce → POS → the other four, one at a time, the next after 24 hours of a clean run.
- **Optional record:** tag each release too, e.g. `git tag booking-services-<yyyy-mm-dd> origin/release/booking-services && git push origin booking-services-<yyyy-mm-dd>`. Dokploy still follows the branch; the tag is only a readable history.
- **Rollback:** move the branch back to the previous release, then run any `db:rollback` the release notes need (plan §8.2):
  ```bash
  git push --force origin <previous commit>:refs/heads/release/booking-services
  ```
  The previous commit is in the production app's **Deployments** tab, or in `git log origin/release/booking-services`.
- **GitHub protection** (once, SC-3): **Settings → Rules → Rulesets → New branch ruleset**, target `release/*`, turn on **Restrict updates**, **Restrict deletions** and **Block force pushes**, and add yourself to the **bypass list**, so only you can release and roll back.

## Deploy order (first time)

1. Create `booking-services-postgres` and `booking-services-redis`.
2. Deploy `booking-services-backend` (server). Migrations run on start. Check `https://api.example.com/health`.
3. Create the first admin user from the backend's Dokploy terminal:
   `docker-entrypoint.sh medusa user -e you@example.com -p <password>`
4. In the admin: create a region, a sales channel and a **publishable API key**.
5. Deploy `booking-services-worker` (same Build Path, worker overrides).
6. Put the publishable key and backend URL into the storefront's **Build-time Arguments**, then deploy `booking-services-storefront`.
7. Set the final domains in the backend CORS variables and redeploy the backend.
8. Provider portal (P3-32): deploy `booking-services-provider-portal` (`COOKIE_SECRET`, `MEDUSA_BACKEND_URL`, `SHOPPER_IP_SECRET` = the backend's), then set the backend's `PROVIDER_CORS` and `PROVIDER_PORTAL_URL` to the portal's URL, add it to `AUTH_CORS`, and redeploy the backend and the worker (the worker sends the emails).

After the first deploy, every service can be redeployed, rebuilt or rolled back **independently**.

## How the pieces connect

- All clients reach the backend only over HTTP. No shared code, no shared files, no shared build.
- Backend CORS must list each client domain:
  - `STORE_CORS` = storefront domain
  - `ADMIN_CORS` = backend/admin domain
  - `AUTH_CORS` = every domain where someone logs in
- The storefront reaches the backend through the public `NEXT_PUBLIC_MEDUSA_BACKEND_URL` (build-time). Runtime `MEDUSA_BACKEND_URL` can be the backend's **internal** Dokploy hostname once starter change 6 in BUILD_PLAN.md §7.2 is applied (faster, private; copy the exact name Dokploy shows for the service, it may carry a suffix). Build-time URLs must be **public**, because the build runs on the build server.
- `NEXT_PUBLIC_*` values are baked in at build time. Changing one = rebuild that client.

## Providers (TASKS P3-31)

People who serve bookings sign in as the actor `provider` (plan §9.3 "Providers", D13). One provider is one person.
- **Staff:** the admin invites them on **Providers** for a staff calendar (an existing staff resource, or a new one) and gives them the **invite code**. They register with that email (`POST /auth/provider/emailpass/register`), accept with the code (`POST /providers/accept`), confirm their email and sign in. They see only their own calendar and no money.
- **Partners:** sign up on their own (`POST /auth/provider/emailpass/register`, then `POST /providers`), confirm their email and wait. Until the admin **approves** them, they can only read `/providers/me`, and their calendars offer no times in the shop. The admin can **suspend** them (their sign-in stops at once) and set their **commission rate** (P3-33).
- What a provider owns: their resources (`booking_resource.provider_id`) and their services (link `booking-provider-product`).
- **What a provider does for themself (P3-32):** sees the bookings on their own calendars, adds a walk-in and cancels (`/providers/me/bookings`). A partner also sets their weekly hours and days off (`/providers/me/resources/:id`, `…/days-off`) and adds their own services with lengths and prices (`/providers/me/services`); these are listed in the shop under Appointments and offer the partner's own times. A staff member's hours and services are set by the admin.
- **Public page (P3-32):** an approved partner has a page in the shop at `/<country>/providers/<handle>` with their photo, area, bio and services (`GET /store/booking/providers/:handle`). Staff and unapproved partners have none.
- **Money (P3-33):** the customer pays the shop. Each partner booking records the shop's commission at the partner's rate (`BOOKING_DEFAULT_COMMISSION_RATE` when unset, else 10%); staff bookings earn none. Cancelling with a refund cancels the commission; cancelling without one keeps it. Any other refund on the order (or a refund after the payout) holds the commission for the admin to **Keep** or **Cancel**. On `BOOKING_PAYOUT_DAY` (default the 1st) the worker makes last month's payout per partner and currency; admin **Partner payouts** lists them to pay by transfer and **Mark paid** with the reference. Partners see it all under **Earnings** in the portal.
- Env: `PROVIDER_CORS` and `PROVIDER_PORTAL_URL` (the portal's origin for `/providers/*` and its verify link), and the portal's origin in `AUTH_CORS`. The portal itself is P3-32.

## Independence rules

- Shared backend code comes only from `packages/medusa-core` (plan §4–§5); this category's own code stays here, and its clients never use the core.
- This project has its **own** Postgres and Redis. Never point two businesses at the same database.
- A second business of the same type = a second Dokploy project built from the same folder, with its own env.
- To add another category's features to this business (e.g. POS for a marketplace), add that module to **this** backend; do not deploy a second backend.

## Services and tickets (TASKS P3-12)

- **A service** (haircut, massage, lesson) is a product **without a shipping profile** whose variants have **Manage inventory** off: one variant per length or staff level, with its length in the variant's metadata as `duration_minutes`. Its cart items need no shipping, so checkout skips the address and delivery steps. Link it to the resources that offer it (`POST /admin/booking/resources/:id` with `variant_ids`). Try it with `pnpm seed:booking-demo` (a Haircut service and one stylist).
- **A visit at the customer's place** (kind B, TASKS P3-20: repairs, cleaning, installation) is a service whose **product** has `booking_kind` = `B` in its **Metadata** (admin → the product → Metadata). Booking it asks the customer for the **address** and **what needs doing**; both are required, kept on the booking (`address`, `notes`) and shown on the cart and order line, in the customer's bookings, in the admin **Bookings** page and in the provider portal. The demo seed adds "Air conditioner service" with technician Vannak in the category **Visits at your place**.
- **A trip from A to B** (kind C, TASKS P3-21: moving, transfers, driver for the day) is a service whose product Metadata has `booking_kind` = `C` and `trip_pricing` = `hours` or `zones`; each variant is a vehicle size, offered by vehicle resources (type equipment, capacity = how many of that size). The customer gives the **pickup** and **drop-off** address. **By the hour:** the variant's price is per hour, the customer picks whole hours from the variant's `min_hours` (Metadata, default 1) to 12, and the price is hours × the hourly price. **By zones:** admin **Trip zones** holds the areas and, per vehicle, the price and minutes of a trip between two of them (both ways). Either way the backend sets the price and checks the time's length; the cart keeps it as a custom price. Distance pricing (a maps service) comes later (owner, 2026-11-17). The demo seed adds **Moving truck** (by the hour) and **Airport transfer** (by zones) in the category **Trips**.
- **A scheduled departure** (kind D, TASKS P3-23: bus, van and boat routes, tours) is a service whose product Metadata has `booking_kind` = `D` (and optionally `max_seats`, default 10, the most seats one booking can take). Each route is a variant with its length (`duration_minutes`) and per-seat price. Its vehicle is a resource whose **weekly hours are its departures**, each window exactly one trip long (07:00–13:00 for a 6-hour bus), and whose **capacity is its seats**. The customer picks the seats and a departure ("37 seats left"); one booking takes all its seats at once (`booking.seats`), the line's quantity is the seat count (so Medusa prices seats × price) and can't be changed in the cart. The demo seed adds **Bus Siem Reap to Phnom Penh** and **Angkor sunrise tour** in the category **Departures**.
- **A rental by dates** (kind E, TASKS P3-22: tents, costumes, vehicles, rooms) is a service whose product Metadata has `booking_kind` = `E` and `rental_unit` = `day` (first to last day, inclusive) or `night` (check-in to check-out). Each size is a variant priced per day or night, offered by an item resource with **Booked by whole days** on (`whole_days`; no weekly hours) and a capacity = how many of it the shop has. The customer picks the dates; the backend books whole local days, never more items than the shop has (a check-out day is free for the next check-in), closes the range if any day in it is a day off, and sets the price (per unit × days or nights). The demo seed adds **Wedding tent** (by the day) and **Guesthouse room** (by the night) in the category **Rentals**.
- **Event tickets by section** (kind F, TASKS P3-24: shows, concerts, workshops) follow Medusa's [Ticket Booking recipe](https://docs.medusajs.com/resources/recipes/ticket-booking) by section rather than numbered seat (owner, 2026-11-17). The product's Metadata has `booking_kind` = `F`; options **Show date** and **Section**; each variant (a date and a section) has `event_starts_at` in its Metadata, **manages inventory**, and its inventory item has **Requires shipping** off and a stocked quantity = that section's seats. Medusa itself refuses more tickets than are left, and checkout skips delivery. When the order is placed, each ticket gets its own code (`booking_ticket`), shown on the order page and emailed in one "Your tickets" email; admin **Tickets** looks a code up and lets the guest in once. The demo seed adds **Apsara dance show** (two Saturdays, Standard 60 seats $15, VIP 20 seats $30) in the category **Events**. Numbered seats with a seat map (the full recipe) aren't built.

