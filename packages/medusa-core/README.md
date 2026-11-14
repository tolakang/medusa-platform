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

Later features (notifications, Telegram, wishlist, account security, housekeeping) move here one per PR (§5.2).

## Rules

- **Data stays the same** (§4.4): a provider keeps its `static identifier` and the apps keep its config `id`; a module keeps its key, tables, links and migration file names.
- Exports (`package.json`): `./providers/<name>` for providers; `./*` for anything else under `src`, e.g. `@medusa-platform/medusa-core/lib/payway/client`.
- A core package needs `src/admin` (even empty) and `ts-node` (MEDUSA_SKILL, SC-1 proof).

## Build and test

```bash
pnpm --filter @medusa-platform/medusa-core build      # medusa plugin:build → .medusa/server
pnpm --filter @medusa-platform/medusa-core test:unit
```

Backends import the **built** output, so build the core before building or testing a backend locally. `scripts/verify.sh` and the backend Dockerfiles do this for you.
