# POS — `pos/`

> **Physical shop checkout + online store on shared stock.** Phase 2 done; running on staging, exit checklist P2-14 passed 2026-11-14 (`docs/TASKS.md`). Three apps:
> - `backend/`: started as a copy of `ecommerce/backend`. The POS module, cashier sign-in, shifts, checkout and the `/pos` and `/admin/pos` routes are in; see *Shop setup and selling*.
> - `pos-app/`: the counter PWA (TASKS P2-10, `pos-app/README.md`).
> - `storefront/`: the online shop, a copy of `ecommerce/storefront` (TASKS P2-09, `storefront/README.md`).
>
> Scope: [BUILD_PLAN.md §9.2](../BUILD_PLAN.md).

This folder is **one complete category**: one Dokploy project, each app built from the repo root (Docker Context Path `.`) and deployed on its own.

```
pos/
├── README.md                <- this guide
├── backend/                 Medusa server + worker
│   ├── Dockerfile
│   ├── docker-entrypoint.sh
│   └── .env.example
├── storefront/              customer storefront
│   ├── Dockerfile
│   └── .env.example
└── pos-app/                 POS counter app (web / PWA)
    ├── Dockerfile
    └── .env.example
```

## Dokploy project: `pos`

| Service | Type | Build Path | Port → example domain | Env source |
|---|---|---|---|---|
| `pos-postgres` | Dokploy **PostgreSQL** | — | — | database `pos` |
| `pos-redis` | Dokploy **Redis** | — | — | — |
| `pos-backend` | Application (Dockerfile) | `/pos/backend` | 9000 → `api.example.com` | `backend/.env.example`, `MEDUSA_WORKER_MODE=server` |
| `pos-worker` | Application (Dockerfile) | `/pos/backend` | none | same env + worker overrides |
| `pos-storefront` | Application (Dockerfile) | `/pos/storefront` | 8000 → `shop.example.com` | `storefront/.env.example` (build args + runtime) |
| `pos-pos-app` | Application (Dockerfile) | `/pos/pos-app` | 3000 → `pos.example.com` | `pos-app/.env.example` (build args + runtime) |

Every application uses **Build Type: Dockerfile** with **Build Path `/`**, **Docker File** `pos/<app>/Dockerfile` and **Docker Context Path** `.` (the repo root, since SC-1: the apps are in the root pnpm workspace; paths relative to the repo root, F-011), and **watch paths** `pos/<app>/**` plus the root `pnpm-workspace.yaml`, `package.json`, `pnpm-lock.yaml`, so a change to one app never redeploys another; a Medusa catalog change redeploys all of them. The "Build Path" column above is the app folder, not the Dokploy Build Path field.

### Shared core and release branches (plan §4–§5)

**Build from the repo root.** POS moved in its SC-1 PR (`docs/TASKS.md` → *Shared core*). For each app (`backend`, `storefront`, `pos-app`) and the worker, in Dokploy:
- **Repository:** `medusa-platform` (General → Provider: GitHub; Branch `main`). Projects created for the old `medusa-apps` repo get no changes from this repo until this is switched; if the repo isn't in the dropdown, give the Dokploy GitHub App access to it first (GitHub → Settings → Applications → Installed GitHub Apps → Configure → Repository access).
- **Docker File:** `pos/<app>/Dockerfile` (unchanged).
- **Docker Context Path:** `.` (the repo root) instead of `pos/<app>`.
- **Watch Paths:** `pos/<app>/**` (the worker: `pos/backend/**`) plus `pnpm-workspace.yaml`, `package.json`, `pnpm-lock.yaml` (the root files of the workspace). Since SC-2 (PayWay moved into the core) the backend and the worker also watch `packages/medusa-core/**`.
- **When to switch:** once that app's SC-1 PR is green, change these fields and save **without** redeploying; then the PR merges and staging builds with the new fields. If a build fails, set the fields back and redeploy: the old image keeps running until then.

**Staging and production branches** (SC-3, before this category's first production deploy):
- **Staging** apps keep **Branch `main`**: every merge redeploys the changed apps.
- **Production** apps use **Branch `release/pos`**, Trigger **On Push**. Only you move it; Claude never does.
- **Release** (after checking staging), from your own terminal:
  ```bash
  git fetch origin && git push origin origin/main:refs/heads/release/pos
  ```
  To release an older checked commit instead, put its hash in place of `origin/main`.
- **Release order** (plan §8.2, D15): a change that reaches several categories (Medusa, pnpm, Node, the core) goes to production Ecommerce → POS → the other four, one at a time, the next after 24 hours of a clean run.
- **Optional record:** tag each release too, e.g. `git tag pos-<yyyy-mm-dd> origin/release/pos && git push origin pos-<yyyy-mm-dd>`. Dokploy still follows the branch; the tag is only a readable history.
- **Rollback:** move the branch back to the previous release, then run any `db:rollback` the release notes need (plan §8.2):
  ```bash
  git push --force origin <previous commit>:refs/heads/release/pos
  ```
  The previous commit is in the production app's **Deployments** tab, or in `git log origin/release/pos`.
- **GitHub protection** (once, SC-3): **Settings → Rules → Rulesets → New branch ruleset**, target `release/*`, turn on **Restrict updates**, **Restrict deletions** and **Block force pushes**, and add yourself to the **bypass list**, so only you can release and roll back.

## Deploy order (first time)

Setup from zero and full reference, including the POS setup and the phase-exit checks: **[DOKPLOY_STAGING.md](./DOKPLOY_STAGING.md)** (starts with a *Fast path*; TASKS P2-14).

1. Create `pos-postgres` and `pos-redis`.
2. Deploy `pos-backend` (server). Migrations run on start. Check `https://api.example.com/health`.
3. Create the first admin user from the backend's Dokploy terminal:
   `docker-entrypoint.sh medusa user -e you@example.com -p <password>`
4. Seed from the same terminal: `docker-entrypoint.sh medusa exec ./src/scripts/seed.js` (Cambodia region, USD default + KHR, Phnom Penh stock location, delivery; safe to re-run), optionally `seed-initial-data.js` (demo products) and then `seed-demo-products.js`. Then copy the `pk_…` key from admin → Settings → Publishable API Keys (it is linked to the **Default Sales Channel**).
5. Deploy `pos-worker` (same Build Path, worker overrides).
6. Put the publishable key, backend URL and the other build args (`DOKPLOY_STAGING.md` Step 5.B) into the storefront's **Build-time Arguments**, then deploy `pos-storefront`. Use the key of the **online** sales channel. Link that key to exactly one channel, which must hold the products (see *Stock*).
7. Deploy `pos-pos-app` with runtime `MEDUSA_BACKEND_URL`, `COOKIE_SECRET` (`openssl rand -hex 32`) and `SHOPPER_IP_SECRET` (the backend's value). Build arguments are optional: the runtime `MEDUSA_BACKEND_URL` wins.
8. Set the final domains in the backend CORS variables and redeploy the backend.

After the first deploy, every service can be redeployed, rebuilt or rolled back **independently**.

## How the pieces connect

- All clients reach the backend only over HTTP. Clients share no code; backends share only `packages/medusa-core`.
- Backend CORS must list each client domain:
  - `STORE_CORS` = storefront domain
  - `ADMIN_CORS` = admin domain only
  - `POS_CORS` = POS app domain. The app built in P2-10 calls `/pos/*` from its own server (the browser never sees the token), so it doesn't need CORS. Set it only for a client that calls `/pos/*` from the browser.
  - `AUTH_CORS` = every domain where someone logs in
- The storefront reaches the backend through the public `NEXT_PUBLIC_MEDUSA_BACKEND_URL` (build-time). Runtime `MEDUSA_BACKEND_URL` can be the backend's **internal** Dokploy hostname once starter change 6 in BUILD_PLAN.md §7.2 is applied (faster, private; copy the exact name Dokploy shows for the service, it may carry a suffix). Build-time URLs must be **public**, because the build runs on the build server.
- `NEXT_PUBLIC_*` values are baked in at build time. Changing one = rebuild that client.

## Cashiers (POS app sign-in)

Cashiers are **not** admin users: they are the custom actor type `cashier` and can only use `/pos/*` (TASKS P2-03). Sign-up is invite-only:

1. An admin invites the cashier on the admin page **Cashiers** (`/app/pos-cashiers`, TASKS F-085), or with `POST /admin/pos/cashiers` `{ "name", "email" }` (list: `GET /admin/pos/cashiers`). The answer carries an **`invite_code`**; give it to the cashier.
2. The cashier registers that email: `POST /auth/cashier/emailpass/register` `{ "email", "password" }` (at least 8 characters) → registration token.
3. The cashier accepts with that token and the code: `POST /pos/cashiers/accept` `{ "invite_code" }` (`Authorization: Bearer <token>`). An email without an active invitation is refused, and so is a wrong code: knowing the invited email isn't enough to take the account.
4. From then on: `POST /auth/cashier/emailpass` → token for `/pos/*` (e.g. `GET /pos/cashiers/me`).

Deactivating a cashier (**Cashiers** page, or `POST /admin/pos/cashiers/:id` `{ "is_active": false }`) locks them out at once, including tokens already issued. Sign-up, sign-in, accepting and password reset have per-IP limits like customers; the till app passes each cashier's own IP (`SHOPPER_IP_SECRET` in the backend and the till app).

## Shop setup and selling (API, TASKS P2-06)

Admin (admin token):
- **Registers** in the admin sidebar (`/app/pos-registers`, TASKS F-085) adds a till with its stock location and sales channel, and activates or deactivates it. API: `POST /admin/pos/registers` `{ name, code, stock_location_id, sales_channel_id }` sets up a till; each register sells from one stock location in one sales channel. List: `GET /admin/pos/registers`. Change: `POST /admin/pos/registers/:id` (name, `is_active`, location, channel).
- **Shift report** in the admin sidebar (`/app/pos-shifts`, TASKS P2-07): shifts per day, register or cashier, with expected cash, counted cash and the variance (red when cash is short). It filters by register, cashier, status and dates, and reads `GET /admin/pos/shifts?register_id=&cashier_id=&status=&from=&to=`.

Cashier: the **POS app** (`pos-app/`, P2-10) does all of this on screen: sign in (first time: *Set your password*), pick a register, open the shift, scan, customer, pay, print, close. The routes underneath (cashier token):
1. `GET /pos/registers` lists the registers; pick one, then `POST /pos/shifts/open` `{ register_id, opening_cash }`.
2. `GET /pos/products/lookup?code=<scanned>&shift_id=` finds the product by barcode, EAN, UPC or SKU, with its price.
3. Optionally find or add the customer: `GET /pos/customers?q=` or `POST /pos/customers` `{ first_name, phone | email }`.
4. `POST /pos/checkout` `{ shift_id, items: [{ variant_id, quantity }], payment_method: cash | card | qr, customer_id?, promo_codes? }` records the sale and returns the order for the receipt. Optional `client_ref` (uuid): a repeat returns the sale already recorded (200).
   - `POST /pos/checkout/preview` `{ shift_id, items, customer_id?, promo_codes? }` returns `{ preview: { subtotal, discount_total, tax_total, total, currency_code } }`, priced with a throwaway cart (same prices, promotions and tax; deleted at once, so no sale number is used). The till calls it when Pay opens and charges that total.
   - `GET /pos/checkout?shift_id&client_ref` returns the recorded sale, or 404 when it was not recorded. After a checkout with no answer the till locks the cart and offers *Retry sale* (same `client_ref`) or *Check and start new* (this lookup).
5. `POST /pos/shifts/close` `{ shift_id, counted_cash }` returns the expected cash and the variance.

Card and QR payments are taken on the shop's own terminal or KHQR stand, and the sale only records them (TASKS F-038).

**Stock (TASKS P2-11).** A register sells only from its own stock location. Give each shop location inventory in the admin (Inventory → item → locations), otherwise the till answers "Not enough stock at <shop>". The sale is fulfilled at once from that location, so the shop's stock goes down at the counter and other locations (the warehouse, the online shop's stock) are untouched. To do that, every register location gets a hidden shipping option, **"In store (POS)"**. It is created when the register is set up and never appears in the online checkout. Don't delete it; if it's deleted, the next sale creates it again.

**Online shop on the same stock (TASKS P2-09).** To let the online shop sell the shop's stock, link the shop's stock location to the online sales channel as well (Admin → Settings → Locations & Shipping → the shop → Sales Channels). The online shop shows stocked − reserved over its channel's locations, so:
- a till sale lowers what the shop page shows at once;
- an online order reserves stock, which the till then can't sell (e.g. "Not enough stock at Phnom Penh: … (7 left)").

Stock that only the online shop should sell (a warehouse) goes in a location that no register uses.

## Independence rules

- Shared backend code comes only from `packages/medusa-core` (plan §4–§5); this category's own code stays here, and its clients never use the core.
- This project has its **own** Postgres and Redis. Never point two businesses at the same database.
- A second business of the same type = a second Dokploy project built from the same repo, with its own env.
- To add another category's features to this business (e.g. POS for a marketplace), add that module to **this** backend; do not deploy a second backend.
