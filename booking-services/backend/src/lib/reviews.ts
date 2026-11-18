// Reviews (TASKS P3-29). Pure parts, unit-tested on their own.

export const REVIEW_NOT_YOURS_MESSAGE = "This booking was not found."
export const REVIEW_NOT_YET_MESSAGE = "You can review a booking after it has taken place."
export const REVIEW_TWICE_MESSAGE = "You have already reviewed this booking."

// A booking the customer had: confirmed or completed, and ended.
export function reviewable(booking: { status: string; ends_at: Date | string }, now: Date): boolean {
  return (booking.status === "confirmed" || booking.status === "completed") && new Date(booking.ends_at).getTime() <= now.getTime()
}

// The name shown with a review: first name and last initial ("Sok C."), or
// "A customer".
export function reviewAuthor(first?: string | null, last?: string | null): string {
  const f = (first ?? "").trim()
  const l = (last ?? "").trim()
  if (!f && !l) return "A customer"
  return [f || null, l ? `${l[0].toUpperCase()}.` : null].filter(Boolean).join(" ")
}

// Average to one decimal, and the count.
export function ratingSummary(ratings: number[]): { average: number | null; count: number } {
  if (!ratings.length) return { average: null, count: 0 }
  return { average: Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10, count: ratings.length }
}

// Asking for a review (P3-29 follow-up): once per booking, from an hour to
// two days after it ended.
export const REVIEW_REQUEST_TEMPLATE = "booking-review-request"

export type ReviewRequestData = { customer_name?: string | null; service: string; url?: string | null }

export function reviewRequestEmail(data: ReviewRequestData, escape: (s: string) => string) {
  const html = `<!doctype html>
<html><body style="font-family:Arial,sans-serif;color:#111">
<h2>How was it?</h2>
<p>${data.customer_name ? `Hello ${escape(data.customer_name)},` : "Hello,"}</p>
<p>Thank you for coming for <strong>${escape(data.service)}</strong>. A few words and a star rating help others choose${
    data.url ? `: <a href="${escape(data.url)}">write a review</a>` : " (in your account, under Bookings)"
  }.</p>
</body></html>`
  return { subject: `How was your ${data.service}?`, html }
}
