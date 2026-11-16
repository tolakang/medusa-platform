# booking-services / provider-portal

Provider portal for the booking-services category (BUILD_PLAN §9.3 "Providers", TASKS P3-32): the people who serve bookings sign in here. A plain Next.js app (plan §7.2), copied from Marketplace's vendor portal and changed for providers. One portal, two roles (P3-31):

- **Sign-in** (`/login`): staff set their password with the **invite code** the shop gave them (register, `POST /providers/accept`); partners **sign up** on their own (register, `POST /providers`) and wait for the shop's approval; both confirm their email first. **Forgot password** emails a link to `/reset-password`.
- **Calendar** (`/`): one day at a time in the calendar's time zone, the bookings with customer, order and status, **Cancel** (the shop's refund rules apply), and a **walk-in** form.
- **Hours and days off** (`/hours`, partners): weekly hours per calendar as text per weekday (`09:00-12:00, 13:00-17:00`), days off to add and remove.
- **Services** (`/services`, partners): their own services with lengths and prices, shown or hidden in the shop, and a form to add one (listed under Appointments, booked on the partner's own hours).
- **Profile** (`/profile`): name, phone, area, photo address and bio. Partners see their commission rate; staff never see money.

**Email links:** the backend builds the confirm-email and reset-password links from `PROVIDER_PORTAL_URL` (or the first `PROVIDER_CORS` origin), so set those on the backend to this app's public URL.

**Security:** as the vendor portal: the backend token is sealed in an httpOnly cookie (`provider_session`, AES-256-GCM under `COOKIE_SECRET`, 8 hours); pages and server actions call the backend from this app's server only, so the browser never holds the token. A refused token (401) signs the provider out; a backend outage shows the error page. Set `SHOPPER_IP_SECRET` to the backend's value so sign-in limits count each provider's own IP.

## Env

`.env.example`: runtime `MEDUSA_BACKEND_URL` (internal Dokploy hostname), `COOKIE_SECRET` (required, 16+ characters), `SHOPPER_IP_SECRET`, `CLIENT_IP_HEADER`, `PORT=3000`.

## Deploy (Dokploy)

Build Path `/`, Docker File `booking-services/provider-portal/Dockerfile`, Docker Context Path `.` (repo root), Watch Paths `booking-services/provider-portal/**`, `pnpm-workspace.yaml`, `package.json`, `pnpm-lock.yaml`, domain → port 3000. Order and backend settings: `../README.md`.

## Verify

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test        # time zones, hours and lengths parsing, the sealed session cookie
docker build -f Dockerfile -t booking-services-provider-portal:check ../..   # context: the repo root
```

Or from the repo root: `scripts/verify.sh booking-services/provider-portal --image`.
