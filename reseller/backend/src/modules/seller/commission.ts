import type { BigNumberInput } from "@medusajs/framework/types"
import { MathBN } from "@medusajs/framework/utils"

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

// TASKS P5-04 (plan §9.5): what a seller earns on an order. Pure, so the
// workflows and the unit tests share it.

/** The shop's default rate, percent: RESELLER_DEFAULT_COMMISSION_RATE, else 10 (`.env.example`). */
export function defaultCommissionRate(env: Record<string, string | undefined> = process.env) {
  const raw = env.RESELLER_DEFAULT_COMMISSION_RATE
  const rate = raw === undefined || raw.trim() === "" ? NaN : Number(raw)
  return Number.isFinite(rate) && rate >= 0 && rate <= 100 ? rate : 10
}

/** The seller's own rate, or the shop's default when the seller has none. */
export function commissionRateFor(
  seller: { commission_rate?: number | null },
  env: Record<string, string | undefined> = process.env
) {
  const own = seller.commission_rate
  return own === null || own === undefined ? defaultCommissionRate(env) : Number(own)
}

/**
 * What a commission is earned on (owner D11, TASKS P5-12): the order's items
 * after discounts, without tax and shipping. Tax isn't the shop's money and
 * shipping is a cost passed on. `item_total` is after discounts with tax;
 * taking off `item_tax_total` works for tax-inclusive and tax-exclusive
 * prices alike (OrderDTO, @medusajs/types).
 */
export function commissionBase(order: {
  item_total?: unknown
  item_tax_total?: unknown
  currency_code?: string | null
}) {
  const base = MathBN.sub(
    MathBN.convert((order.item_total as number) ?? 0),
    MathBN.convert((order.item_tax_total as number) ?? 0)
  )
  return Math.max(0, roundToCurrency(base, order.currency_code))
}

/** rate percent of the base, rounded to the currency's minor units, never below 0. */
export function commissionAmount(base: number, rate: number, currencyCode?: string | null) {
  if (base <= 0 || rate <= 0) {
    return 0
  }
  return roundToCurrency(MathBN.div(MathBN.mult(base, rate), 100), currencyCode)
}

export type CommissionAdjustment =
  | { action: "none"; reason: string }
  | { action: "cancel" }
  | { action: "amount"; amount: number }

export type CommissionEvent =
  | { kind: "canceled" }
  // `order_grand_total`: everything the customer paid, which refunds are
  // taken from. Missing (older callers) = the commission's own base.
  | { kind: "refunded"; refunded_total: number; order_grand_total?: number }

/**
 * What an order's cancellation or refund does to its commission: nothing to a
 * paid or cancelled one (a paid one is clawed back by the payout, P5-05);
 * a cancelled order cancels it; a refund recalculates it on the share of the
 * order the shop kept (refunds are of the whole order, the commission base is
 * its items only), and cancels it when nothing is left.
 */
export function adjustCommission(
  commission: {
    status: string
    order_total: number
    rate: number
    amount: number
    currency_code?: string | null
  },
  event: CommissionEvent
): CommissionAdjustment {
  if (commission.status === "cancelled") {
    return { action: "none", reason: "already cancelled" }
  }
  if (commission.status === "paid") {
    return { action: "none", reason: "already paid out" }
  }
  if (event.kind === "canceled") {
    return { action: "cancel" }
  }
  const base = Number(commission.order_total)
  const paidTotal = Number(event.order_grand_total ?? base)
  const refunded = Number(event.refunded_total)
  if (refunded >= paidTotal || base <= 0) {
    return { action: "cancel" }
  }
  const kept = paidTotal > 0 ? (base * (paidTotal - refunded)) / paidTotal : 0
  if (kept <= 0) {
    return { action: "cancel" }
  }
  const amount = commissionAmount(kept, Number(commission.rate), commission.currency_code)
  return amount === Number(commission.amount)
    ? { action: "none", reason: "unchanged" }
    : { action: "amount", amount }
}
