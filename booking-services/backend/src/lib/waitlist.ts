// Waitlist (TASKS P3-29): a customer waits for a full day of a service and is
// emailed once when a time frees up. Pure parts, unit-tested on their own.

export const WAITLIST_TEMPLATE = "booking-waitlist"
export const WAITLIST_MAX_DAYS = 90
export const WAITLIST_FREE_MESSAGE = "There are free times that day: book one instead."
export const WAITLIST_DATE_MESSAGE = "Choose a day from today on, at most 90 days ahead."
export const WAITLIST_SERVICE_MESSAGE = "This service doesn't take a waitlist."

// Today in the shop's zone, YYYY-MM-DD.
export const localDate = (now: Date, timeZone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now)

export function waitlistDateOk(date: string, now: Date, timeZone: string): boolean {
  const today = localDate(now, timeZone)
  const last = localDate(new Date(now.getTime() + WAITLIST_MAX_DAYS * 86_400_000), timeZone)
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= today && date <= last
}

// A time-slot service: not quote-only (P3-27), not a rental (P3-22) or event
// tickets (P3-24), which have their own availability.
export function waitlistService(meta: Record<string, unknown> | null | undefined): boolean {
  return meta?.quote_only !== true && meta?.booking_kind !== "E" && meta?.booking_kind !== "F" && meta?.booking_extra !== true
}

export type WaitlistEmailData = {
  customer_name?: string | null
  service: string
  date: string
  times: string[]
  url?: string | null
}

export function waitlistEmail(data: WaitlistEmailData, escape: (s: string) => string) {
  const day = new Date(`${data.date}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  })
  const html = `<!doctype html>
<html><body style="font-family:Arial,sans-serif;color:#111">
<h2>A time is free</h2>
<p>${data.customer_name ? `Hello ${escape(data.customer_name)},` : "Hello,"}</p>
<p>${escape(data.service)} has a free time on <strong>${escape(day)}</strong>: ${data.times.map(escape).join(", ")}.</p>
<p>Others may be waiting too: the first to book gets it${data.url ? `. <a href="${escape(data.url)}">Book now</a>` : ""}.</p>
</body></html>`
  return { subject: `A time is free: ${data.service}, ${day}`, html }
}
