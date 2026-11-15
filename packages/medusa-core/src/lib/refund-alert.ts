// Staff Telegram alert when a payment is refunded (owner, 2026-11-15: "add
// refund alert for all app as the share code first"). Part of the order
// notifications (BUILD_PLAN.md §4.2). Each app's Telegram provider renders the
// template with refundAlertStaffMessage (src/modules/telegram/templates.ts).
// Plain text: the provider sends no parse_mode.

export const PAYMENT_REFUNDED_STAFF_TEMPLATE = "payment-refunded-staff"

// payment.refunded carries only the payment's ID (@medusajs/utils
// PaymentEvents.REFUNDED); its payment collection leads to the order
// (link order ↔ payment_collection, as Reseller's and Marketplace's
// commission subscribers read it).
export const REFUND_ALERT_FIELDS = [
  "id",
  "amount",
  "currency_code",
  "refunds.id",
  "refunds.amount",
  "refunds.note",
  "refunds.created_at",
  "refunds.refund_reason.label",
  "payment_collection.order.id",
  "payment_collection.order.display_id",
  "payment_collection.order.email",
  "payment_collection.order.currency_code",
  "payment_collection.order.shipping_address.first_name",
  "payment_collection.order.shipping_address.last_name",
  "payment_collection.order.shipping_address.phone",
]

export type RefundAlertPayment = {
  id: string
  amount?: unknown
  currency_code?: string | null
  refunds?: ({
    id: string
    amount?: unknown
    note?: string | null
    created_at?: string | Date | null
    refund_reason?: { label?: string | null } | null
  } | null)[] | null
  payment_collection?: {
    order?: {
      id: string
      display_id?: number | string | null
      email?: string | null
      currency_code?: string | null
      shipping_address?: {
        first_name?: string | null
        last_name?: string | null
        phone?: string | null
      } | null
    } | null
  } | null
}

// What the notification carries (stored in the notification's `data`).
export type RefundAlertData = {
  order: {
    id: string
    display_id?: number | string | null
    email?: string | null
    name?: string | null
    phone?: string | null
  }
  refund: { id: string; amount: number; reason?: string | null; note?: string | null }
  currency_code: string
  refunded_total: number
  payment_amount: number
}

export function formatMoney(amount: unknown, currencyCode?: string | null) {
  const value = Number(amount ?? 0)
  const currency = (currencyCode || "usd").toUpperCase()
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value)
  } catch {
    return `${value} ${currency}`
  }
}

// The event names no refund, so the alert is about the newest one; the
// total refunded so far covers refunds made close together.
export function refundAlertData(payment: RefundAlertPayment | undefined): RefundAlertData | null {
  const order = payment?.payment_collection?.order
  const refunds = (payment?.refunds ?? []).filter(
    (r): r is NonNullable<typeof r> => !!r
  )
  if (!payment || !order || refunds.length === 0) {
    return null
  }
  const time = (r: (typeof refunds)[number]) => new Date(r.created_at ?? 0).getTime()
  const latest = refunds.reduce((a, b) => (time(b) >= time(a) ? b : a))
  const address = order.shipping_address
  const name = [address?.first_name, address?.last_name].filter(Boolean).join(" ")
  return {
    order: {
      id: order.id,
      display_id: order.display_id ?? null,
      email: order.email ?? null,
      name: name || null,
      phone: address?.phone ?? null,
    },
    refund: {
      id: latest.id,
      amount: Number(latest.amount ?? 0),
      reason: latest.refund_reason?.label ?? null,
      note: latest.note ?? null,
    },
    currency_code: payment.currency_code || order.currency_code || "usd",
    refunded_total: refunds.reduce((sum, r) => sum + Number(r.amount ?? 0), 0),
    payment_amount: Number(payment.amount ?? 0),
  }
}

export function refundAlertStaffMessage(data: RefundAlertData | null | undefined): string {
  if (!data?.refund) {
    return "💸 Refund"
  }
  const money = (v: unknown) => formatMoney(v, data.currency_code)
  const customer = [data.order?.name, data.order?.email].filter(Boolean).join(", ")
  return [
    `💸 Refund on order #${data.order?.display_id ?? "?"} — ${money(data.refund.amount)}`,
    data.refund.reason ? `Reason: ${data.refund.reason}` : "",
    data.refund.note ? `Note: ${data.refund.note}` : "",
    `Refunded so far: ${money(data.refunded_total)} of ${money(data.payment_amount)} paid`,
    customer ? `Customer: ${customer}` : "",
    data.order?.phone ? `Phone: ${data.order.phone}` : "",
  ]
    .filter(Boolean)
    .join("\n")
}
