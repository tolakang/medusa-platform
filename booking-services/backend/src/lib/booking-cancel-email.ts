// The customer's email when staff (a provider or the shop) cancel a single
// paid booking, with the refund (the single-booking twin of package-email,
// P3-30 follow-up). Pure, unit-tested.

export const BOOKING_CANCELLED_TEMPLATE = "booking-cancelled"

export type BookingCancelledEmailData = {
  customer_name?: string | null
  service?: string | null
  calendar: string
  timezone: string
  starts_at: string
  refunded_amount?: number | null
  currency_code?: string | null
}

export function bookingCancelledEmail(data: BookingCancelledEmailData, escape: (s: string) => string) {
  const when = new Intl.DateTimeFormat("en-GB", {
    timeZone: data.timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(data.starts_at))
  const what = data.service ?? "Your booking"
  const money =
    data.refunded_amount && data.currency_code
      ? new Intl.NumberFormat("en-US", { style: "currency", currency: data.currency_code.toUpperCase() }).format(data.refunded_amount)
      : null
  const html = `<!doctype html>
<html><body style="font-family:Arial,sans-serif;color:#111">
<h2>Your booking is cancelled</h2>
<p>${data.customer_name ? `Hello ${escape(data.customer_name)},` : "Hello,"}</p>
<p>Your <strong>${escape(what)}</strong> on ${escape(when)} with ${escape(data.calendar)} has been cancelled by the shop.${
    money ? ` ${escape(money)} is refunded to your payment.` : ""
  }</p>
<p>Questions? Reply to this email.</p>
</body></html>`
  return { subject: `${what} on ${when} cancelled`, html }
}
