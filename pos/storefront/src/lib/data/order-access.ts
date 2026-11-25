import "server-only"
import { createHmac, randomBytes, timingSafeEqual } from "crypto"
import { cookies as nextCookies } from "next/headers"

// Who may see an order's name, address and phone on the storefront (role test,
// 2026-11-25): anyone with the confirmation link saw them. Now only the browser
// that placed the order (a signed, short-lived cookie set in placeOrder) or the
// signed-in customer who owns it; everyone else gets a minimal page.
//
// ORDER_ACCESS_SECRET (server-only env) signs the cookie. The backend checks the
// same proof (x-order-access header), so both need the same value. Without it a
// random per-process secret is used and the backend refuses the proof: only the
// signed-in owner then sees the order, which is safe.
const COOKIE = "_medusa_order_access"
const MAX_AGE_SECONDS = 60 * 60 * 24
const MAX_ORDERS = 5

const g = globalThis as unknown as { __orderAccessSecret?: string }
const secret = () =>
  process.env.ORDER_ACCESS_SECRET?.trim() ||
  (g.__orderAccessSecret ??= randomBytes(32).toString("hex"))

const sign = (orderId: string, expires: number) =>
  createHmac("sha256", secret()).update(`${orderId}.${expires}`).digest("hex")

type Entry = { id: string; exp: number; sig: string }

const read = async (): Promise<Entry[]> => {
  const raw = (await nextCookies()).get(COOKIE)?.value
  if (!raw) {
    return []
  }
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Entry[]) : []
  } catch {
    return []
  }
}

/** Call from a server action right after the order is placed. */
export const grantOrderAccess = async (orderId: string) => {
  const now = Math.floor(Date.now() / 1000)
  const exp = now + MAX_AGE_SECONDS
  const kept = (await read()).filter((e) => e.exp > now && e.id !== orderId)
  const entries = [...kept, { id: orderId, exp, sig: sign(orderId, exp) }].slice(
    -MAX_ORDERS
  )
  ;(await nextCookies()).set(COOKIE, JSON.stringify(entries), {
    maxAge: MAX_AGE_SECONDS,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  })
}

const validEntry = async (orderId: string): Promise<Entry | undefined> => {
  const now = Math.floor(Date.now() / 1000)
  return (await read()).find((e) => {
    if (e?.id !== orderId || typeof e.exp !== "number" || e.exp <= now) {
      return false
    }
    const expected = new Uint8Array(Buffer.from(sign(e.id, e.exp)))
    const given = new Uint8Array(Buffer.from(String(e.sig ?? "")))
    return given.length === expected.length && timingSafeEqual(given, expected)
  })
}

/** True when this browser placed the order in the last day. */
export const hasOrderAccess = async (orderId: string): Promise<boolean> =>
  !!(await validEntry(orderId))

/**
 * The proof the backend asks for on GET /store/orders/:id (and /telegram-link)
 * when no signed-in owner calls: `x-order-access: <exp>.<sig>`, checked with
 * the same ORDER_ACCESS_SECRET (packages/medusa-core/src/api/order-access.ts).
 */
export const orderAccessHeaders = async (
  orderId: string
): Promise<Record<string, string>> => {
  const entry = await validEntry(orderId)
  return entry ? { "x-order-access": `${entry.exp}.${entry.sig}` } : {}
}
