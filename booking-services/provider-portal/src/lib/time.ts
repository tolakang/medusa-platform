// Calendar dates and times in a calendar's own time zone (TASKS P3-32), as
// the admin's Bookings page shows them (backend src/admin/lib/
// booking-calendar.ts and modules/booking/utils/slot.ts; the portal shares no
// code with the backend, so the pure helpers are repeated here and tested in
// __tests__/time.test.ts).

export type LocalTime = { date: string; time: string }

export function toLocalTime(at: Date, timeZone: string): LocalTime {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value])
  )
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` }
}

// "YYYY-MM-DD" + "HH:MM" local to the zone → that instant in UTC. Two passes,
// so a daylight-saving change on that day is handled.
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [y, mo, d] = date.split("-").map(Number)
  const [h, mi] = time.split(":").map(Number)
  const naive = Date.UTC(y, mo - 1, d, h, mi)
  const offsetAt = (at: number) => {
    const l = toLocalTime(new Date(at), timeZone)
    const [ly, lmo, ld] = l.date.split("-").map(Number)
    const [lh, lmi] = l.time.split(":").map(Number)
    return Date.UTC(ly, lmo - 1, ld, lh, lmi) - at
  }
  const first = naive - offsetAt(naive)
  return new Date(naive - offsetAt(first))
}

export const isDate = (value: string | undefined | null): value is string =>
  !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export const todayIn = (timeZone: string, now = new Date()) => toLocalTime(now, timeZone).date

// The UTC window of one local day.
export function dayWindow(date: string, timeZone: string) {
  return {
    from: zonedTimeToUtc(date, "00:00", timeZone).toISOString(),
    to: zonedTimeToUtc(addDays(date, 1), "00:00", timeZone).toISOString(),
  }
}

export function timeRange(b: { starts_at: string; ends_at: string }, timeZone: string): string {
  return `${toLocalTime(new Date(b.starts_at), timeZone).time}–${toLocalTime(new Date(b.ends_at), timeZone).time}`
}

// The walk-in form: a local date, "HH:MM" and a length, as the instants the
// API takes.
export function walkInTimes(date: string, time: string, minutes: number, timeZone: string) {
  const starts = zonedTimeToUtc(date, time, timeZone)
  return {
    starts_at: starts.toISOString(),
    ends_at: new Date(starts.getTime() + minutes * 60_000).toISOString(),
  }
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

// "Thu 19 Nov 2026", the same on every server locale.
export function dayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number)
  return `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]} ${y}`
}

// "Asia/Phnom_Penh" → "Phnom Penh time", as the admin's Bookings page says it.
export const zoneLabel = (zone: string) => `${(zone.split("/").pop() ?? zone).replace(/_/g, " ")} time`
