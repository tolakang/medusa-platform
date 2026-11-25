import type { BigNumberInput } from "@medusajs/framework/types"
import { MathBN } from "@medusajs/framework/utils"

// TASKS P6-06 (plan §9.6): commission and payout rules. Pure, shared by the
// workflows and the unit tests. Same rules as Reseller (P5-04, P5-05, D11).

type Env = Record<string, string | undefined>

/** The marketplace's default rate, percent: MARKETPLACE_DEFAULT_COMMISSION_RATE, else 10. */
export function defaultCommissionRate(env: Env = process.env) {
  const raw = env.MARKETPLACE_DEFAULT_COMMISSION_RATE
  const rate = raw === undefined || raw.trim() === "" ? NaN : Number(raw)
  return Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : 10
}

/** The vendor's own rate, or the marketplace default when it has none. */
export function commissionRateFor(
  vendor: { commission_rate?: number | null },
  env: Env = process.env
) {
  const own = vendor.commission_rate
  return own === null || own === undefined ? defaultCommissionRate(env) : Number(own)
}

// Riel is used without decimals (owner 2026-11-25), though ISO 4217 and
// Intl give KHR 2; the map wins over Intl.
const DECIMALS: Record<string, number> = { khr: 0 }

/**
 * How many decimals a currency's amounts have: the map above, else Intl's
 * (USD 2, JPY 0). Unknown or missing code: 2.
 */
export function currencyDecimals(currencyCode?: string | null) {
  if (!currencyCode) {
    return 2
  }
  const own = DECIMALS[currencyCode.toLowerCase()]
  if (own !== undefined) {
    return own
  }
  try {
    return (
      new Intl.NumberFormat("en", { style: "currency", currency: currencyCode.toUpperCase() })
        .resolvedOptions().maximumFractionDigits ?? 2
    )
  } catch {
    return 2
  }
}

/** The amount rounded to the currency's minor units. */
export const roundToCurrency = (value: BigNumberInput, currencyCode?: string | null) =>
  MathBN.convert(value, currencyDecimals(currencyCode)).toNumber()

const cents = (value: BigNumberInput, currencyCode?: string | null) =>
  roundToCurrency(value, currencyCode)

/**
 * What a commission is taken on: the child order's items after discounts,
 * without tax and shipping (`item_total − item_tax_total`, as Reseller D11).
 */
export function commissionBase(order: {
  item_total?: BigNumberInput | null
  item_tax_total?: BigNumberInput | null
  currency_code?: string | null
}) {
  const base = MathBN.sub(order.item_total ?? 0, order.item_tax_total ?? 0)
  return Math.max(0, cents(base, order.currency_code))
}

/** rate percent of the base, rounded to the currency's minor units. */
export function commissionAmount(base: number, rate: number, currencyCode?: string | null) {
  return base <= 0 || rate <= 0 ? 0 : cents(MathBN.div(MathBN.mult(base, rate), 100), currencyCode)
}

/** What the vendor is owed for the order: its total minus the commission, never below 0. */
export function vendorPayoutAmount(
  orderTotal: BigNumberInput,
  commission: number,
  currencyCode?: string | null
) {
  return Math.max(0, cents(MathBN.sub(orderTotal, commission), currencyCode))
}

/** Day of the month payouts are made: MARKETPLACE_PAYOUT_DAY, 1 to 28, else 1. */
export function payoutDay(env: Env = process.env) {
  const day = Number(env.MARKETPLACE_PAYOUT_DAY)
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
  vendor_id: string
  currency_code: string
  amount: number
  commission_ids: string[]
}

/** Commissions grouped into one payout per vendor and currency. */
export function groupPayouts(
  commissions: {
    id: string
    vendor_id: string
    currency_code: string
    payout_amount: BigNumberInput
  }[]
): PayoutLine[] {
  const lines = new Map<string, PayoutLine>()
  // Summed exactly, rounded once per line (rounding each step drifts).
  const sums = new Map<string, ReturnType<typeof MathBN.convert>>()
  for (const c of commissions) {
    const key = `${c.vendor_id}:${c.currency_code}`
    const line = lines.get(key) ?? {
      vendor_id: c.vendor_id,
      currency_code: c.currency_code,
      amount: 0,
      commission_ids: [],
    }
    const sum = MathBN.add(sums.get(key) ?? 0, c.payout_amount)
    sums.set(key, sum)
    line.amount = cents(sum, c.currency_code)
    line.commission_ids.push(c.id)
    lines.set(key, line)
  }
  return [...lines.values()].sort(
    (a, b) => a.vendor_id.localeCompare(b.vendor_id) || a.currency_code.localeCompare(b.currency_code)
  )
}

// The lock a payout run holds. A commission cancel and a refund settlement
// take it too, so neither can change a commission between the payout's read
// and its write (review 2, S6; reseller does the same per order,
// REVIEW_FIXES B10).
export const PAYOUTS_LOCK = "marketplace-vendor-payouts"
