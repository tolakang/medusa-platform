import { MathBN } from "@medusajs/framework/utils"

// Deposit and balance (TASKS P3-26, plan §9.3 shared features; owner,
// 2026-11-17: a percent per service, the balance paid at the shop or venue).
// A service's product has metadata.deposit_percent (1-99): at checkout the
// customer pays that part of its lines, other lines in full; the rest stays
// on the order as an outstanding payment collection that staff mark paid.
// Pure, unit-tested in __tests__/deposits.unit.spec.ts.

type Meta = Record<string, unknown> | null | undefined

export const BALANCE_TEMPLATE = "booking-balance-reminder"
export const BALANCE_METADATA_KEY = "booking_balance"

export function depositPercent(product: { metadata?: Meta } | null | undefined): number | null {
  const n = Number(product?.metadata?.deposit_percent)
  return Number.isFinite(n) && n >= 1 && n <= 99 ? n : null
}

const cents = (v: unknown) => MathBN.convert((v ?? 0) as number, 2).toNumber()

/** What to pay now: each line's deposit share, or the whole line. */
export function depositNow(lines: { total: unknown; percent: number | null }[]): number {
  return cents(
    lines.reduce((sum, l) => MathBN.add(sum, l.percent === null ? cents(l.total) : MathBN.div(MathBN.mult(cents(l.total), l.percent), 100)), MathBN.convert(0))
  )
}

/** Days before the booking the reminder goes out: BOOKING_BALANCE_REMINDER_DAYS, 0-30, else 2. */
export function reminderDays(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.BOOKING_BALANCE_REMINDER_DAYS)
  return env.BOOKING_BALANCE_REMINDER_DAYS?.trim() && Number.isInteger(n) && n >= 0 && n <= 30 ? n : 2
}

export type BalanceReminderData = {
  order_display_id: number | null
  customer_name?: string | null
  amount: number
  currency_code: string
  due_at: string
}

export function balanceReminderEmail(data: BalanceReminderData, escape: (s: string) => string) {
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: data.currency_code.toUpperCase() }).format(data.amount)
  const day = new Date(data.due_at).toISOString().slice(0, 10)
  const hello = data.customer_name ? `Hello ${escape(data.customer_name)},` : "Hello,"
  const html = `<!doctype html>
<html><body style="font-family:Arial,sans-serif;color:#111">
<h2>Balance to pay</h2>
<p>${hello}</p>
<p>You paid a deposit for order${data.order_display_id ? ` #${data.order_display_id}` : ""}. The balance of <strong>${escape(money)}</strong> is due by your booking on <strong>${escape(day)}</strong>.</p>
<p>Please pay it at the shop or when we meet you (cash, card or transfer).</p>
</body></html>`
  return { subject: `Balance of ${money} due by ${day}`, html }
}
