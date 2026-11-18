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
