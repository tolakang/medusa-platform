import { toLocalTime, zonedTimeToUtc } from "../modules/booking/utils/slot"

// Recurring bookings (TASKS P3-29): the same calendar and local time every
// week, 2-12 times, booked together. Pure, unit-tested on its own.

export const RECURRING_MIN_WEEKS = 2
export const RECURRING_MAX_WEEKS = 12
export const RECURRING_SERVICE_MESSAGE = "This service can't be booked every week."
export const SERIES_ITEM_KEY = "booking_series_id"

export type Every = "week" | "2weeks" | "month"
export const EVERY: Every[] = ["week", "2weeks", "month"]

// Repeated times from the first one, at the same local clock time in the
// calendar's zone (a clock change keeps the local time): every week, every
// two weeks, or every month on the same day (the month's last day when it's
// shorter, e.g. 31 Jan → 28 Feb → 31 Mar).
export function repeatOccurrences(starts: Date, ends: Date, timeZone: string, count: number, every: Every = "week") {
  const length = ends.getTime() - starts.getTime()
  const first = toLocalTime(starts, timeZone)
  const [y, m, d] = first.date.split("-").map(Number)
  const out: { starts_at: Date; ends_at: Date }[] = []
  for (let n = 0; n < count; n++) {
    let date: string
    if (every === "month") {
      const lastDay = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate()
      date = new Date(Date.UTC(y, m - 1 + n, Math.min(d, lastDay))).toISOString().slice(0, 10)
    } else {
      const day = new Date(`${first.date}T00:00:00Z`)
      day.setUTCDate(day.getUTCDate() + (every === "2weeks" ? 14 : 7) * n)
      date = day.toISOString().slice(0, 10)
    }
    const at = zonedTimeToUtc(date, first.time, timeZone)
    out.push({ starts_at: at, ends_at: new Date(at.getTime() + length) })
  }
  return out
}

export const weeklyOccurrences = (starts: Date, ends: Date, timeZone: string, weeks: number) =>
  repeatOccurrences(starts, ends, timeZone, weeks, "week")

// A time-slot service with one place: not a trip, departure, rental, event,
// quote-only service or extra.
export function recurringService(meta: Record<string, unknown> | null | undefined): boolean {
  const kind = meta?.booking_kind
  return !["C", "D", "E", "F"].includes(kind as string) && meta?.quote_only !== true && meta?.booking_extra !== true
}

// A series price (P3-29 follow-up): product Metadata series_discount_percent
// (1-50) takes that part off each visit booked as a series.
export function seriesDiscount(meta: Record<string, unknown> | null | undefined): number | null {
  const n = Number(meta?.series_discount_percent)
  return Number.isInteger(n) && n >= 1 && n <= 50 ? n : null
}
