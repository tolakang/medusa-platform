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
| Refund alert (staff Telegram on `payment.refunded`) | `src/subscribers/payment-refunded-alert.ts`, `src/workflows/notify-payment-refunded.ts`, `src/lib/refund-alert.ts` | the five with Telegram (not Wholesale) | owner, 2026-11-15 |

Later features (notifications, Telegram, wishlist, account security, housekeeping) move here one per PR (§5.2).

## Rules

- **Data stays the same** (§4.4): a provider keeps its `static identifier` and the apps keep its config `id`; a module keeps its key, tables, links and migration file names.
- Exports (`package.json`): `./providers/<name>` for providers; `./*` for anything else under `src`, e.g. `@medusa-platform/medusa-core/lib/payway/client`.
- A core package needs `src/admin` (even empty) and `ts-node` (MEDUSA_SKILL, SC-1 proof).
- **Injected, not linked** (F-095): every backend lists the core under `dependenciesMeta` with `injected: true`, so it gets a copy of the core whose Medusa packages are the backend's own. A plain link would load the core's own dev copy of `@medusajs/medusa`, and any core code that imports `@medusajs/medusa/core-flows` would stop the app ("Workflow with id … already exists"). The root `syncInjectedDepsAfterScripts: [build]` refreshes the copies after each core build.
- **Peer dependencies are exact** (`2.22.6`, as the Medusa plugin docs show), not `catalog:`: pnpm doesn't resolve `catalog:` in an injected copy. `scripts/update-medusa.sh` bumps them with the catalog and `scripts/guard.sh` (3c) checks they match.
- **A subscriber** is switched on in an app by a one-line file in its `src/subscribers`: `export { default, config } from "@medusa-platform/medusa-core/subscribers/<name>"`.

## Build and test

```bash
pnpm --filter @medusa-platform/medusa-core build      # medusa plugin:build → .medusa/server
pnpm --filter @medusa-platform/medusa-core test:unit
```

Backends import the **built** output, so build the core before building or testing a backend locally. `scripts/verify.sh` and the backend Dockerfiles do this for you.
