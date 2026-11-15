# `packages/medusa-core`

The shared core of the backends (BUILD_PLAN.md §4). Code that is the same in several backends lives here once; each backend switches on only the features it uses.

**Library mode, never `plugins`.** Backends register the core's parts themselves, for example a provider in `medusa-config.ts`:

```ts
{ resolve: "@medusa-platform/medusa-core/providers/payway", id: "payway", options: { … } }
```

Listing the package under `plugins` would switch every module, route, subscriber, job and link on in every app (§4.1).

## Features

| Feature | Where | Used by | Since |
|---|---|---|---|
| PayWay (provider `pp_payway_payway`) | `src/providers/payway`, `src/lib/payway/client.ts`, `src/lib/safe-equal.ts` | all six backends | SC-2 |
| Notifications: Resend provider (`createResendNotificationService`, the app passes its email renderer), order emails, `order-placed` (customer email and staff alert) | `src/lib/resend/`, `src/lib/order-notification.ts`, `src/workflows/notify-order-placed.ts`, `src/subscribers/order-placed.ts` | the five with notifications (not Wholesale) | SC-2 |
| Telegram: provider (both bots), module `telegram_links`, customer updates, order link and webhook routes, set-webhook script | `src/providers/telegram`, `src/lib/telegram/templates.ts`, `src/lib/telegram-customer.ts`, `src/lib/telegram-contact.ts`, `src/lib/phone.ts` (copy), `src/modules/telegram-links`, `src/workflows/telegram-customer.ts`, `src/subscribers/telegram-customer-updates.ts`, `src/api/store/orders/[id]/telegram-link`, `src/api/telegram/webhook`, `src/scripts/telegram-set-webhook.ts` | the five with notifications (not Wholesale) | SC-2 |
| Wishlist: module `wishlist`, 3 links, 5 store routes, workflows, share tokens | `src/modules/wishlist`, `src/links/wishlist-*.ts`, `src/api/store/customers/me/wishlists`, `src/api/store/wishlists`, `src/workflows/wishlist.ts`, `src/lib/wishlist-share.ts` | the five with notifications (not Wholesale) | SC-2 |
| Account security: account emails, password change and reset, CAPTCHA, per-IP rate limits, phone and contact checks, upload limit, auth guards | `src/lib/{auth-email,captcha,rate-limit,upload-limit-setting,phone,safe-equal}.ts`, `src/lib/resend/{account-email,emails}.ts`, `src/api/{auth-guards,upload-limits,contact-validation}.ts`, `src/api/admin/upload-limit`, `src/api/store/customers/me/password{,-reset}`, `src/subscribers/auth-*.ts`, `src/workflows/{change-password,send-auth-email}.ts` | the five (Booking keeps its own `contact-validation.ts`; Marketplace hooks the verification link) | SC-2 |
| Housekeeping: unverified-account cleanup (job and workflow), storefront revalidate | `src/jobs/cleanup-unverified-accounts.ts`, `src/workflows/cleanup-unverified-accounts.ts`, `src/subscribers/storefront-revalidate.ts` | the five (not Wholesale) | SC-2 |
| Refund alert (staff Telegram on `payment.refunded`) | `src/subscribers/payment-refunded-alert.ts`, `src/workflows/notify-payment-refunded.ts`, `src/lib/refund-alert.ts` | the five with Telegram (not Wholesale) | owner, 2026-11-15 |

Later features (search, then seeds) move here one per PR (§5.2).

## Rules

- **Data stays the same** (§4.4): a provider keeps its `static identifier` and the apps keep its config `id`; a module keeps its key, tables, links and migration file names.
- Exports (`package.json`): `./providers/<name>` for providers; `./*` for anything else under `src`, e.g. `@medusa-platform/medusa-core/lib/payway/client`.
- A core package needs `src/admin` (even empty) and `ts-node` (MEDUSA_SKILL, SC-1 proof).
- **Injected, not linked** (F-095): every backend lists the core under `dependenciesMeta` with `injected: true`, so it gets a copy of the core whose Medusa packages are the backend's own. A plain link would load the core's own dev copy of `@medusajs/medusa`, and any core code that imports `@medusajs/medusa/core-flows` would stop the app ("Workflow with id … already exists"). The root `syncInjectedDepsAfterScripts: [build]` refreshes the copies after each core build.
- **Peer dependencies are exact** (`2.22.6`, as the Medusa plugin docs show), not `catalog:`: pnpm doesn't resolve `catalog:` in an injected copy. `scripts/update-medusa.sh` bumps them with the catalog and `scripts/guard.sh` (3c) checks they match.
- **A provider with app templates** (Resend) is a factory in `src/lib/`: the app's own `src/modules/<name>/index.ts` calls it with the app's renderer and registers the result, so the app's `resolve`, `id` and the provider's `identifier` stay as they were.
- **A module** is registered from its built folder: `{ resolve: "@medusa-platform/medusa-core/.medusa/server/src/modules/<name>" }`; its migrations keep their file names, so a migrated database runs nothing new. **A route or script** is a one-line file in the app: `export { GET } from "@medusa-platform/medusa-core/api/…/route"`, `export { default } from "@medusa-platform/medusa-core/scripts/<name>"`.
- **A link** moves with its module and is never defined in both places: the app's `src/links/<name>.ts` is `export { default } from "@medusa-platform/medusa-core/links/<name>"`. **Middlewares** stay in the app's `src/api/middlewares.ts` and import the core's validators.
- **A scheduled job** is a one-line file in the app's `src/jobs`: `export { default, config } from "@medusa-platform/medusa-core/jobs/<name>"`.
- **A subscriber** is switched on in an app by a one-line file in its `src/subscribers`: `export { default, config } from "@medusa-platform/medusa-core/subscribers/<name>"`.

## Build and test

```bash
pnpm --filter @medusa-platform/medusa-core build      # medusa plugin:build → .medusa/server
pnpm --filter @medusa-platform/medusa-core test:unit
```

Backends import the **built** output, so build the core before building or testing a backend locally. `scripts/verify.sh` and the backend Dockerfiles do this for you.
