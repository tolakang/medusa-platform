// TASKS P3-32: display helpers and form parsing (pure, tested in
// __tests__/format.test.ts).

export function money(amount: number | string | null | undefined, currency: string): string {
  const value = Number(amount ?? 0)
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(value)
  } catch {
    return `${value.toFixed(2)} ${currency.toUpperCase()}`
  }
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
// Shown Monday first.
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

export type Hours = { weekday: number; start_time: string; end_time: string }

const HHMM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/

/** One weekday's hours as text: "09:00-12:00, 13:00-17:00" ("" = closed). */
export function hoursText(hours: Hours[], weekday: number): string {
  return hours
    .filter((h) => h.weekday === weekday)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
    .map((h) => `${h.start_time}-${h.end_time}`)
    .join(", ")
}

/**
 * The hours form (one text per weekday) → the body of
 * POST /providers/me/resources/:id. A string is the error to show.
 */
export function parseHours(texts: Record<number, string | undefined>): Hours[] | string {
  const all: Hours[] = []
  for (const weekday of WEEK_ORDER) {
    const text = (texts[weekday] ?? "").trim()
    if (!text) {
      continue
    }
    const ranges: Hours[] = []
    for (const part of text.split(",")) {
      const [start, end, extra] = part.trim().split(/\s*[-–]\s*/)
      const pad = (t: string | undefined) => (t && /^\d:\d\d$/.test(t) ? `0${t}` : t ?? "")
      const start_time = pad(start)
      const end_time = pad(end)
      if (extra !== undefined || !HHMM.test(start_time) || !HHMM.test(end_time) || start_time >= end_time) {
        return `${WEEKDAYS[weekday]}: write hours like 09:00-12:00, 13:00-17:00 (leave empty when closed).`
      }
      ranges.push({ weekday, start_time, end_time })
    }
    ranges.sort((a, b) => a.start_time.localeCompare(b.start_time))
    if (ranges.some((r, i) => i > 0 && r.start_time < ranges[i - 1].end_time)) {
      return `${WEEKDAYS[weekday]}: the hours overlap.`
    }
    all.push(...ranges)
  }
  return all
}

export type Length = { minutes: number; price: number }

/** The service form's length rows → lengths. A string is the error to show. */
export function parseLengths(rows: { minutes?: string; price?: string }[]): Length[] | string {
  const lengths: Length[] = []
  for (const row of rows) {
    const minutesText = (row.minutes ?? "").trim()
    const priceText = (row.price ?? "").trim()
    if (!minutesText && !priceText) {
      continue
    }
    const minutes = Number(minutesText)
    const price = priceValue(priceText)
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 720) {
      return "A length is a whole number of minutes, from 5 to 720."
    }
    if (typeof price === "string") {
      return price
    }
    if (lengths.some((l) => l.minutes === minutes)) {
      return `${minutes} minutes is listed twice.`
    }
    lengths.push({ minutes, price })
  }
  return lengths.length ? lengths : "Add at least one length with its price."
}

/** A price field → the amount, or the error to show. */
export function priceValue(raw: string | undefined): number | string {
  const text = (raw ?? "").trim()
  const price = Number(text)
  return text !== "" && Number.isFinite(price) && price >= 0 && price <= 1_000_000
    ? Math.round(price * 100) / 100
    : "Enter a price, 0 or more, e.g. 12.50."
}

export const STATUS_LABEL: Record<string, string> = {
  confirmed: "Confirmed",
  pending: "Being paid",
  completed: "Done",
  cancelled: "Cancelled",
  expired: "Expired",
  no_show: "No-show",
}

type CalendarBookingLike = {
  customer?: { email: string | null; first_name: string | null; last_name: string | null } | null
  customer_name?: string | null
  walk_in_name?: string | null
  walk_in_phone?: string | null
}

export function customerLabel(b: CalendarBookingLike): string {
  const c = b.customer
  // The customer's name, else the order's address name (the backend's
  // customer_name), else a walk-in's name; the email only when none is known.
  const name = b.customer_name || [c?.first_name, c?.last_name].filter(Boolean).join(" ")
  if (name) return name
  if (b.walk_in_name) return `Walk-in: ${b.walk_in_name}`
  return c?.email || (b.walk_in_phone ? `Walk-in: ${b.walk_in_phone}` : "Walk-in")
}

// The email or phone, shown under the name (empty when the label shows it).
export function customerContact(b: CalendarBookingLike): string {
  const label = customerLabel(b)
  return [b.customer?.email, b.walk_in_phone].filter((v): v is string => !!v && !label.includes(v)).join(" · ")
}

// The backend's message for a phone it refuses (medusa-core lib/phone).
export const PHONE_MESSAGE = "Enter a phone number with digits only, for example 012 345 678 or +855 12 345 678."

// The backend's phone rule (medusa-core lib/phone): an optional leading +,
// then digits, spaces, hyphens or parentheses, 8 to 15 digits.
export function isValidPhone(value: string): boolean {
  if (!value) return true
  if (!/^\+?[0-9 ()-]+$/.test(value)) return false
  const digits = value.replace(/\D/g, "").length
  return digits >= 8 && digits <= 15
}
