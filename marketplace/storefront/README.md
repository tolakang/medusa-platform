# marketplace / storefront

Customer storefront for the marketplace category (BUILD_PLAN §9.6). Standard: `BUILD_PLAN.md` §7.2.

**Copied from `ecommerce/storefront` at `main` `eaacbfa`** (TASKS Phase 6, owner 2026-11-12: full copy of Ecommerce; F-072), tracked files only. It talks to `marketplace/backend`, which has the same store routes, so PayWay checkout, the Cambodia address and phone rules, Telegram contact and CAPTCHA work as in Ecommerce.
- Package name `marketplace-storefront`; the Dockerfile, `.env.example` and comments name `marketplace/*`.
- `.guard-baseline` is `776911e ecommerce/storefront` (this repo's first commit; in medusa-apps it was `159252e`): the starter's type suppressions came with the copy, and `scripts/guard.sh` compares against that app at the starter import.

**P6-08:** checkout completes through the backend's `POST /store/carts/:id/complete-vendor` (`placeOrder` in `src/lib/data/cart.ts`), which also makes one order per vendor; product pages say "Sold by" with a link to the vendor's shop page `/[countryCode]/vendors/[handle]` (`src/lib/data/vendors.ts`).

Still in force from the copy and the starter (plan §7.2):
- Part of the root pnpm workspace: no own lockfile; `@medusajs/*` come from the root catalog (**2.22.6**, `"catalog:"`); pnpm from the root `packageManager`. Next.js **16.4.5**.
- `output: "standalone"` in `next.config.js`; image host from `S3_IMAGE_HOSTNAME` / `S3_IMAGE_PATHNAME`.
- `src/lib/config.ts`: server-side calls prefer the runtime `MEDUSA_BACKEND_URL` (private URL); `src/middleware.ts` uses the public `NEXT_PUBLIC_MEDUSA_BACKEND_URL`.
- `products/[handle]/page.tsx` is `force-dynamic` (TASKS F-015).

## Env
- **Build-time** (Dokploy Build-time Arguments, every `ARG` in the Dockerfile): `NEXT_PUBLIC_MEDUSA_BACKEND_URL` (public), `NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY` (required, or the build aborts), `NEXT_PUBLIC_SHOP_NAME` (header, footer, titles), `NEXT_PUBLIC_BASE_URL`, `NEXT_PUBLIC_DEFAULT_REGION` (`kh`), `NEXT_PUBLIC_STRIPE_KEY`, `NEXT_PUBLIC_CAPTCHA_PROVIDER`, `NEXT_PUBLIC_CAPTCHA_SITE_KEY`, `S3_IMAGE_HOSTNAME`, `S3_IMAGE_PATHNAME`. From PR #95: `NEXT_PUBLIC_MANUAL_PAYMENT_LABEL` (the manual payment's name; default "Pay later (cash or bank transfer)") and `NEXT_PUBLIC_CONTACT_URL` (contact link in the order help; unset = none).
- **Runtime:** `MEDUSA_BACKEND_URL` (internal Dokploy hostname), `REVALIDATE_SECRET`, `SHOPPER_IP_SECRET`, `CLIENT_IP_HEADER`, `PORT=8000`.

## Deploy (Dokploy)
Build Path `/`, Docker File `marketplace/storefront/Dockerfile`, Docker Context Path `.`, Watch Paths `marketplace/storefront/**`, `pnpm-workspace.yaml`, `package.json`, `pnpm-lock.yaml`, domain → port 8000. Order and CORS: `../README.md`. Use the publishable key whose sales channel holds the products; Medusa's own first-boot key sees none (TASKS F-017).

## Verify (DEV_FLOW §5)
```bash
pnpm install --frozen-lockfile
NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_placeholder pnpm build   # must pass with the backend down
pnpm typecheck
docker build -f Dockerfile --build-arg NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=pk_placeholder -t marketplace-storefront:check ../..   # context: the repo root
```
The full local stack is in `../docker-compose.local.yml`.
