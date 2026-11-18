// A booking line's detail for order emails and the staff alert (the core
// shows `metadata.line_detail` under the item): when, where, with whom, how
// many. Pure, unit-tested.

export const LINE_DETAIL_KEY = "line_detail"

export type LineDetailInput = {
  starts_at: string
  ends_at: string
  timezone: string
  resource_name?: string | null
  whole_days?: boolean
  trip_label?: string | null
  seats?: number
  address?: string | null
  dropoff_address?: string | null
  pass?: boolean
  package_piece?: boolean
}

const fmt = (iso: string, tz: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, ...opts }).format(new Date(iso))
const DAY: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }
const TIME: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }

export function bookingLineDetail(i: LineDetailInput): string {
  const lines: string[] = []
  if (i.whole_days) {
    // A rental: its label says how long and the dates ("1 night: 2026-12-10 to 2026-12-11").
    lines.push(i.trip_label || fmt(i.starts_at, i.timezone, DAY))
  } else {
    const when = `${fmt(i.starts_at, i.timezone, DAY)}, ${fmt(i.starts_at, i.timezone, TIME)}–${fmt(i.ends_at, i.timezone, TIME)}`
    lines.push(i.resource_name ? `${when} with ${i.resource_name}` : when)
    if (i.trip_label) lines.push(i.trip_label)
  }
  if ((i.seats ?? 1) > 1) lines.push(`${i.seats} seats`)
  if (i.address && i.dropoff_address) lines.push(`From: ${i.address}`, `To: ${i.dropoff_address}`)
  else if (i.address) lines.push(`At: ${i.address}`)
  if (i.pass) lines.push("Paid with your pass")
  if (i.package_piece) lines.push("Part of your event package")
  return lines.join("\n")
}

export function packageLineDetail(eventDate: string): string {
  return `Event on ${new Date(`${eventDate}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}`
}
