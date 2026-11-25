# reseller / storefront

Customer storefront for the reseller category (BUILD_PLAN §9.5). Standard: `BUILD_PLAN.md` §7.2.

**Copied from `ecommerce/storefront` at `main` `847465d`** (TASKS Phase 5, owner 2026-11-10: full copy of Ecommerce; F-061), tracked files only. It talks to `reseller/backend`, which has the same store routes, so PayWay checkout, the Cambodia address and phone rules, Telegram contact and CAPTCHA work as in Ecommerce.
- Package name `reseller-storefront`; the Dockerfile, `.env.example` and comments name `reseller/*`.
- `.env.example` gains `SELLER_RESOLVE_MODE` and `DEFAULT_SELLER_HANDLE` (plan §9.5, read from P5-07 on).
- `.guard-baseline` is `776911e ecommerce/storefront` (this repo's first commit; in medusa-apps it was `159252e`): the starter's type suppressions came with the copy, and `scripts/guard.sh` compares against that app at the starter import.

**P5-07, multi-tenant:** one deployment serves every seller's domain. `src/lib/data/seller.ts` maps the request's `Host` (or the `path` cookie from `/api/seller/<handle>`) to the seller's publishable key through the backend's `GET /store/sellers/resolve` (cached 300 s); `src/lib/config.ts` sends it with every request (server side from the host, browser side from the `<meta>` the root layout writes). No seller → your own channel (`NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY`). Browser search on a seller's domain needs that origin in the backend's `STORE_CORS`.

Still in force from the copy and the starter (plan §7.2):
- Part of the root pnpm workspace: no own lockfile; `@medusajs/*` come from the root catalog (**2.22.6**, `"catalog:"`); pnpm from the root `packageManager`. Next.js **16.4.5**.
- `output: "standalone"` in `next.config.js`; image host from `S3_IMAGE_HOSTNAME` / `S3_IMAGE_PATHNAME`.
- `src/lib/config.ts`: server-side calls prefer the runtime `MEDUSA_BACKEND_URL` (private URL); `src/middleware.ts` uses the public `NEXT_PUBLIC_MEDUSA_BACKEND_URL`.
- `products/[handle]/page.tsx` is `force-dynamic` (TASKS F-015).

## Env
- **Build-time** (Dokploy Build-time Arguments, every `ARG` in the Dockerfile): `NEXT_PUBLIC_MEDUSA_BACKEND_URL` (public), `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` (required, or the build aborts), `NEXT_PUBLIC_SHOP_NAME` (header, footer, titles), `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_DEFAULT_REGION` (`kh`), `NEXT_PUBLIC_STRIPE_KEY`, `NEXT_PUBLIC_CAPTCHA_PROVIDER`, `NEXT_PUBLIC_CAPTCHA_SITE_KEY`, `S3_IMAGE_HOSTNAME`, `S3_IMAGE_PATHNAME`. From PR #95: `NEXT_PUBLIC_MANUAL_PAYMENT_LABEL` (the manual payment's name; default "Pay later (cash or bank transfer)") and `NEXT_PUBLIC_CONTACT_URL` (contact link in the order help; unset = none).
- **Runtime:** `MEDUSA_BACKEND_URL` (internal Dokploy hostname), `REVALIDATE_SECRET`, `SHOPPER_IP_SECRET`, `CLIENT_IP_HEADER`, `PORT=8000`, `SELLER_RESOLVE_MODE`, `DEFAULT_SELLER_HANDLE`.

## Deploy (Dokploy)
Build Path `/`, Docker File `reseller/storefront/Dockerfile`, Docker Context Path `.`, Watch Paths `reseller/storefront/**`, `pnpm-workspace.yaml`, `package.json`, `pnpm-lock.yaml`, domain → port 8000. Order and CORS: `../README.md`. Use the publishable key whose sales channel holds the products; Medusa's own first-boot key sees none (TASKS F-017).

## Verify (DEV_FLOW §5)
```bash
pnpm install --frozen-lockfile
NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_placeholder pnpm build   # must pass with the backend down
pnpm typecheck
docker build -f Dockerfile --build-arg NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_placeholder -t reseller-storefront:check ../..   # context: the repo root
```
The full local stack is in `../docker-compose.local.yml`.
