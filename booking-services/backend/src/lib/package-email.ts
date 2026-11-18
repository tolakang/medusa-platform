// The customer's email when staff cancel or move their event package (TASKS
// P3-30 follow-up). Pure, unit-tested.

export const PACKAGE_CHANGED_TEMPLATE = "booking-package-changed"

export type PackageChangedData = {
  kind: "cancelled" | "moved"
  customer_name?: string | null
  title: string
  event_date: string
  new_date?: string | null
  refunded_amount?: number | null
  currency_code?: string | null
}

const day = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })

export function packageChangedEmail(data: PackageChangedData, escape: (s: string) => string) {
  const hello = data.customer_name ? `Hello ${escape(data.customer_name)},` : "Hello,"
  const money =
    data.refunded_amount && data.currency_code
      ? new Intl.NumberFormat("en-US", { style: "currency", currency: data.currency_code.toUpperCase() }).format(data.refunded_amount)
      : null
  const body =
    data.kind === "moved"
      ? `<p>Your <strong>${escape(data.title)}</strong> has moved from ${escape(day(data.event_date))} to <strong>${escape(day(data.new_date ?? data.event_date))}</strong>. Every part moved with it, at the same times.</p>`
      : `<p>Your <strong>${escape(data.title)}</strong> on ${escape(day(data.event_date))} has been cancelled by the shop.${
          money ? ` ${escape(money)} is refunded to your payment.` : ""
        }</p>`
  const html = `<!doctype html>
<html><body style="font-family:Arial,sans-serif;color:#111">
<h2>${data.kind === "moved" ? "Your event has a new date" : "Your event is cancelled"}</h2>
<p>${hello}</p>
${body}
<p>Questions? Reply to this email.</p>
</body></html>`
  const subject =
    data.kind === "moved" ? `${data.title}: now on ${day(data.new_date ?? data.event_date)}` : `${data.title} on ${day(data.event_date)} cancelled`
  return { subject, html }
}
