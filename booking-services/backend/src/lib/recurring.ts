import { toLocalTime, zonedTimeToUtc } from "../modules/booking/utils/slot"

// Recurring bookings (TASKS P3-29): the same calendar and local time every
// week, 2-12 times, booked together. Pure, unit-tested on its own.

export const RECURRING_MIN_WEEKS = 2
export const RECURRING_MAX_WEEKS = 12
export const RECURRING_SERVICE_MESSAGE = "This service can't be booked every week."
export const SERIES_ITEM_KEY = "booking_series_id"

// Weekly times from the first one, at the same local clock time in the
// calendar's zone (a clock change keeps the local time).
export function weeklyOccurrences(starts: Date, ends: Date, timeZone: string, weeks: number) {
  const length = ends.getTime() - starts.getTime()
  const first = toLocalTime(starts, timeZone)
  const out: { starts_at: Date; ends_at: Date }[] = []
  for (let w = 0; w < weeks; w++) {
    const day = new Date(`${first.date}T00:00:00Z`)
    day.setUTCDate(day.getUTCDate() + 7 * w)
    const at = zonedTimeToUtc(day.toISOString().slice(0, 10), first.time, timeZone)
    out.push({ starts_at: at, ends_at: new Date(at.getTime() + length) })
  }
  return out
}

// A time-slot service with one place: not a trip, departure, rental, event,
// quote-only service or extra.
export function recurringService(meta: Record<string, unknown> | null | undefined): boolean {
  const kind = meta?.booking_kind
  return !["C", "D", "E", "F"].includes(kind as string) && meta?.quote_only !== true && meta?.booking_extra !== true
}
