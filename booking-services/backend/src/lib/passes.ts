// Passes (TASKS P3-29): a product sold as credits for services. Product
// Metadata: `pass_credits` (1-100 per unit bought), `pass_valid_days`
// (1-730, default 365) and `pass_for` (the handles of the services it
// covers). Pure parts, unit-tested on their own.

export const PASS_ITEM_KEY = "booking_pass_id"
export const PASS_NOT_FOUND_MESSAGE = "This pass was not found."
export const PASS_EXPIRED_MESSAGE = "This pass has expired."
export const PASS_EMPTY_MESSAGE = "This pass has no credits left."
export const PASS_SERVICE_MESSAGE = "This pass doesn't cover this service."

type Meta = Record<string, unknown> | null | undefined

export type PassProduct = { credits: number; valid_days: number; covers: string[] }

export function passProduct(meta: Meta): PassProduct | null {
  const credits = Number(meta?.pass_credits)
  if (!Number.isInteger(credits) || credits < 1 || credits > 100) return null
  const days = Number(meta?.pass_valid_days ?? 365)
  const covers = Array.isArray(meta?.pass_for) ? (meta!.pass_for as unknown[]).filter((h): h is string => typeof h === "string") : []
  if (!covers.length) return null
  return { credits, valid_days: Number.isInteger(days) && days >= 1 && days <= 730 ? days : 365, covers }
}

// Can this pass pay for one more booking of this service? `inCart` = credits
// this cart already takes from it.
export function passProblem(
  pass: { credits_left: number; expires_at: Date | string; product_ids: unknown },
  productId: string,
  bookingStartsAt: Date,
  inCart: number
): string | null {
  const ids = Array.isArray(pass.product_ids) ? (pass.product_ids as string[]) : []
  if (!ids.includes(productId)) return PASS_SERVICE_MESSAGE
  if (new Date(pass.expires_at).getTime() < bookingStartsAt.getTime()) return PASS_EXPIRED_MESSAGE
  if (pass.credits_left - inCart < 1) return PASS_EMPTY_MESSAGE
  return null
}
