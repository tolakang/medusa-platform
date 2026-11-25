# ecommerce / storefront

Next.js customer storefront for the ecommerce category. Standard: `BUILD_PLAN.md` §7.2.

**Starter:** `medusajs/dtc-starter` `apps/storefront` at commit **`f677db4`** (2026-10-09, Medusa 2.21.2; synced from `15ef93d`: the starter removed `generateStaticParams` from the product, collection and category pages, PR medusajs/dtc-starter#73; before that, from `e3a237c9b877`: only the 2.21.2 package bump). `engines.node` is `>=22.23.4` (since Medusa 2.22.3, TASKS V-01). **Next.js 16 sync (2026-11-06, TASKS V-04):** the starter's `6b95717` "migrate storefront to Next.js 16" is applied: `next` / `eslint-config-next` **16.4.5** (the starter is on 16.3.8; 16.4.5 carries the 2026-11-03 security fixes), ESLint flat config (`eslint.config.mjs`, `pnpm lint` = `eslint .`), `default.tsx` for the account `@dashboard` and `@login` slots, async `params` on the order-transfer pages, `revalidateTag(tag, { expire: 0 })`, tsconfig `moduleResolution: bundler` / `jsx: react-jsx`. `pnpm lint` reports existing starter-code issues (gift-card stubs, `any`, `@ts-ignore`); lint is not a gate. Starter changes applied (plan §7.2):
1. In the root pnpm workspace (since SC-1): settings and Medusa pins (catalog) in the root `pnpm-workspace.yaml`, own `pnpm-lock.yaml` (`sharedWorkspaceLockfile: false`), pnpm version = the root `package.json` `packageManager` (starter root `pnpm.overrides` carried over; `unrs-resolver` build declined, as in the starter).
2. Package renamed `@dtc/storefront` → `ecommerce-storefront`. A `typecheck` script was added, because the starter sets `typescript.ignoreBuildErrors`.
3. `output: "standalone"` + `outputFileTracingRoot: __dirname` in `next.config.js`.
4. Image host from `S3_IMAGE_HOSTNAME` / `S3_IMAGE_PATHNAME` (was `MEDUSA_CLOUD_S3_*`).
5. ~~`generateStaticParams` guarded~~: no longer needed. Since `f677db4` the starter has no `generateStaticParams`, so `next build` never calls the backend and pages render on request (BUILD_PLAN §7.2 change 5, Revision 7).
6. `src/lib/config.ts`: server-side calls prefer the runtime `MEDUSA_BACKEND_URL` (private URL). Verified: a wrong runtime URL breaks SSR and the correct one serves it. `src/middleware.ts` still uses the public `NEXT_PUBLIC_MEDUSA_BACKEND_URL`.
7. `products/[handle]/page.tsx`: `export const dynamic = "force-dynamic"`. The starter's cookie helpers swallow Next's `DynamicServerError`, so pre-rendered or revalidating product pages returned 500 (`DYNAMIC_SERVER_USAGE`) in the Docker image. Reproduced locally and fixed; upstream report medusajs/nextjs-starter-medusa#439 (TASKS F-015).

## Env
- **Build-time** (Dokploy Build-time Arguments; the Dockerfile's `ARG`s): `NEXT_PUBLIC_MEDUSA_BACKEND_URL` (public), `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` ( required, or the build aborts), `NEXT_PUBLIC_SHOP_NAME` (header, footer, titles; empty = "Online Shop"), `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_DEFAULT_REGION` (default `kh`), `NEXT_PUBLIC_STRIPE_KEY` (empty: payments go through PayWay), `NEXT_PUBLIC_CAPTCHA_PROVIDER` and `NEXT_PUBLIC_CAPTCHA_SITE_KEY` (match the backend's `CAPTCHA_PROVIDER`), `NEXT_PUBLIC_MANUAL_PAYMENT_LABEL` (how manual payment is named; default "Pay later (cash or bank transfer)"), `NEXT_PUBLIC_CONTACT_URL` (Telegram/mailto/page shown in order help; unset = none), `S3_IMAGE_HOSTNAME`, `S3_IMAGE_PATHNAME`.
- **Runtime:** `NODE_ENV=production`, `PORT=8000`, `MEDUSA_BACKEND_URL` (internal Dokploy hostname or the public API URL), `REVALIDATE_SECRET`, `SHOPPER_IP_SECRET`, `CLIENT_IP_HEADER`, `STOREFRONT_LOCALES`. Details in `.env.example`.

## Deploy (Dokploy)
Steps: `../DOKPLOY_STAGING.md` section 4 (Build Path `/`, Docker File `ecommerce/storefront/Dockerfile`, Docker Context Path `.` (the repo root), Watch Paths `ecommerce/storefront/**`, `pnpm-workspace.yaml`, `package.json`, `pnpm-lock.yaml`). Use the publishable key whose sales channel holds the products; Medusa's own first-boot key sees none (TASKS F-017).

## Verify (DEV_FLOW §5)
```bash
pnpm install --frozen-lockfile
NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_placeholder pnpm build   # must pass with the backend down
pnpm typecheck
~/.kiri/bin/docker --context kiri build -f Dockerfile --build-arg NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_placeholder -t ecommerce-storefront:check ../..   # context: the repo root
```
The full local stack: `~/.kiri/bin/docker --context kiri compose -f ../docker-compose.local.yml up -d` (categories share host ports: run one local stack at a time).
