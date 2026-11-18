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
  // A payment plan's first instalment is the deposit (TASKS P3-30).
  const plan = paymentPlan(product?.metadata)
  if (plan) return plan[0].percent
  const n = Number(product?.metadata?.deposit_percent)
  return Number.isFinite(n) && n >= 1 && n <= 99 ? n : null
}

// Payment plan (TASKS P3-30, plan §9.3 "H can split into several payments"):
// product Metadata `payment_plan`, 2-6 instalments adding up to 100%. The
// first is paid at checkout; each later one has `days_before` the event
// (the first booking's start) and becomes its own outstanding balance.
export type Instalment = { percent: number; days_before: number | null }

export function paymentPlan(meta: Meta): Instalment[] | null {
  const raw = meta?.payment_plan
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 6) return null
  const plan: Instalment[] = []
  for (const [i, r] of (raw as Record<string, unknown>[]).entries()) {
    const percent = Number(r?.percent)
    const days = i === 0 ? null : Number(r?.days_before)
    if (!Number.isInteger(percent) || percent < 1 || percent > 99) return null
    if (i > 0 && (!Number.isInteger(days) || days! < 0 || days! > 365)) return null
    plan.push({ percent, days_before: days })
  }
  if (plan.reduce((s, p) => s + p.percent, 0) !== 100) return null
  // Later instalments come in date order: further from the event first.
  for (let i = 2; i < plan.length; i++) if (plan[i].days_before! > plan[i - 1].days_before!) return null
  return plan
}

/** The later instalments of one line: amounts (the last takes the rounding) and due dates (never before now). */
export function instalmentsDue(total: unknown, plan: Instalment[], eventStart: Date, now: Date): { amount: number; due_at: string }[] {
  const whole = cents(total)
  const first = cents(MathBN.div(MathBN.mult(whole, plan[0].percent), 100))
  let left = cents(MathBN.sub(whole, first))
  const later = plan.slice(1)
  return later.map((p, i) => {
    const amount = i === later.length - 1 ? left : cents(MathBN.div(MathBN.mult(whole, p.percent), 100))
    left = cents(MathBN.sub(left, amount))
    const due = new Date(Math.max(eventStart.getTime() - p.days_before! * 86_400_000, now.getTime()))
    return { amount, due_at: due.toISOString() }
  })
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
  // A payment plan's instalment number (2, 3…), P3-30.
  instalment?: number | null
}

export function balanceReminderEmail(data: BalanceReminderData, escape: (s: string) => string) {
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: data.currency_code.toUpperCase() }).format(data.amount)
  const day = new Date(data.due_at).toISOString().slice(0, 10)
  const hello = data.customer_name ? `Hello ${escape(data.customer_name)},` : "Hello,"
  const html = `<!doctype html>
<html><body style="font-family:Arial,sans-serif;color:#111">
<h2>Balance to pay</h2>
<p>${hello}</p>
<p>${
    data.instalment
      ? `Payment ${data.instalment} of your plan for order${data.order_display_id ? ` #${data.order_display_id}` : ""}, <strong>${escape(money)}</strong>, is due by <strong>${escape(day)}</strong>.`
      : `You paid a deposit for order${data.order_display_id ? ` #${data.order_display_id}` : ""}. The balance of <strong>${escape(money)}</strong> is due by your booking on <strong>${escape(day)}</strong>.`
  }</p>
<p>Please pay it at the shop or when we meet you (cash, card or transfer).</p>
</body></html>`
  return { subject: `Balance of ${money} due by ${day}`, html }
}
