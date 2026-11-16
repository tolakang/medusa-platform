import type { BigNumberInput } from "@medusajs/framework/types"
import { MathBN } from "@medusajs/framework/utils"

// TASKS P3-33 (plan §9.3 "Money"): commission and payout rules for partner
// bookings. Pure, shared by the workflows and the unit tests. The same rules
// as Marketplace (lib/vendor-commission.ts, P6-06) with Booking's own env.

type Env = Record<string, string | undefined>

/** The shop's default rate for partners, percent: BOOKING_DEFAULT_COMMISSION_RATE, else 10. */
export function defaultCommissionRate(env: Env = process.env) {
  const raw = env.BOOKING_DEFAULT_COMMISSION_RATE
  const rate = raw === undefined || raw.trim() === "" ? NaN : Number(raw)
  return Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : 10
}

/** The partner's own rate, or the shop's default when it has none. */
export function commissionRateFor(
  provider: { commission_rate?: number | null },
  env: Env = process.env
) {
  const own = provider.commission_rate
  return own === null || own === undefined ? defaultCommissionRate(env) : Number(own)
}

const cents = (value: BigNumberInput) => MathBN.convert(value, 2).toNumber()

/** What a commission is taken on: the booking's line without tax (as Marketplace, D11). */
export function commissionBase(line: { total?: BigNumberInput | null; tax_total?: BigNumberInput | null }) {
  return Math.max(0, cents(MathBN.sub(line.total ?? 0, line.tax_total ?? 0)))
}

/** rate percent of the base, rounded to cents. */
export function commissionAmount(base: number, rate: number) {
  return base <= 0 || rate <= 0 ? 0 : cents(MathBN.div(MathBN.mult(base, rate), 100))
}

/** What the partner is owed for the booking: its line total minus the commission, never below 0. */
export function providerPayoutAmount(lineTotal: BigNumberInput, commission: number) {
  return Math.max(0, cents(MathBN.sub(lineTotal, commission)))
}

/** Day of the month payouts are made: BOOKING_PAYOUT_DAY, 1 to 28, else 1. */
export function payoutDay(env: Env = process.env) {
  const day = Number(env.BOOKING_PAYOUT_DAY)
  return Number.isInteger(day) && day >= 1 && day <= 28 ? day : 1
}

export const isPayoutDay = (now: Date, env: Env = process.env) =>
  now.getUTCDate() === payoutDay(env)

/** Commissions recorded before this moment (the 1st of now's month, UTC) are due. */
export const payoutCutoff = (now: Date) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

/** The month a payout made at `now` covers, "YYYY-MM" (the month before, UTC). */
export function payoutPeriod(now: Date) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

export type PayoutLine = {
  provider_id: string
  currency_code: string
  amount: number
  commission_ids: string[]
}

/** Commissions grouped into one payout per partner and currency. */
export function groupPayouts(
  commissions: {
    id: string
    provider_id: string
    currency_code: string
    payout_amount: BigNumberInput
  }[]
): PayoutLine[] {
  const lines = new Map<string, PayoutLine>()
  for (const c of commissions) {
    const key = `${c.provider_id}:${c.currency_code}`
    const line = lines.get(key) ?? {
      provider_id: c.provider_id,
      currency_code: c.currency_code,
      amount: 0,
      commission_ids: [],
    }
    line.amount = cents(MathBN.add(line.amount, c.payout_amount))
    line.commission_ids.push(c.id)
    lines.set(key, line)
  }
  return [...lines.values()].sort(
    (a, b) => a.provider_id.localeCompare(b.provider_id) || a.currency_code.localeCompare(b.currency_code)
  )
}

// The lock a payout run holds. A commission cancel and a refund settlement
// take it too, so neither can change a commission between the payout's read
// and its write (as Marketplace, review 2 S6).
export const PAYOUTS_LOCK = "booking-provider-payouts"
