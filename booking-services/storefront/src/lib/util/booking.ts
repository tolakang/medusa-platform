import type { HttpTypes } from "@medusajs/types"

// Booking helpers shared by the product page, cart and checkout (TASKS P3-13).
// A service is a product whose variants have metadata.duration_minutes and
// no shipping (backend P3-12); a booking line item carries metadata
// booking_id, booking_starts_at, booking_ends_at, booking_resource_name,
// booking_timezone and, for a visit, booking_address (add-booking-to-cart,
// P3-04 / P3-13 / P3-20).

type Meta = Record<string, unknown> | null | undefined

export function durationMinutes(variant: { metadata?: Meta } | null | undefined): number | null {
  const n = Number(variant?.metadata?.duration_minutes)
  return Number.isInteger(n) && n > 0 ? n : null
}

// A service done at the customer's place (kind B, TASKS P3-20): its product
// has metadata.booking_kind "B". Booking it asks for the address and what
// needs doing.
export function isVisitService(product: { metadata?: Meta } | null | undefined): boolean {
  return product?.metadata?.booking_kind === "B"
}

// A trip (kind C, TASKS P3-21): its product has metadata.booking_kind "C" and
// metadata.trip_pricing "hours" (whole hours of a vehicle) or "zones" (a price
// between two areas). Null for any other service.
export type TripPricing = "hours" | "zones"
export function tripPricing(product: { metadata?: Meta } | null | undefined): TripPricing | null {
  if (product?.metadata?.booking_kind !== "C") {
    return null
  }
  const mode = product.metadata?.trip_pricing
  return mode === "hours" || mode === "zones" ? mode : null
}

export const MAX_TRIP_HOURS = 12
/** A vehicle's minimum hours (variant metadata.min_hours, default 1). */
export function minHours(variant: { metadata?: Meta } | null | undefined): number {
  const n = Number(variant?.metadata?.min_hours)
  return Number.isInteger(n) && n >= 1 && n <= MAX_TRIP_HOURS ? n : 1
}

/** The price row between two zones, either way round. */
export function zonePrice<T extends { from_zone_id: string; to_zone_id: string }>(rows: T[], a: string, b: string): T | null {
  return rows.find((r) => (r.from_zone_id === a && r.to_zone_id === b) || (r.from_zone_id === b && r.to_zone_id === a)) ?? null
}

// A rental by dates (kind E, TASKS P3-22): product metadata.booking_kind "E"
// and metadata.rental_unit "day" (start to end inclusive) or "night"
// (check-in to check-out).
export type RentalUnit = "day" | "night"
export function rentalUnit(product: { metadata?: Meta } | null | undefined): RentalUnit | null {
  if (product?.metadata?.booking_kind !== "E") {
    return null
  }
  const unit = product.metadata?.rental_unit
  return unit === "day" || unit === "night" ? unit : null
}

// A scheduled departure (kind D, TASKS P3-23): product metadata.booking_kind
// "D"; a booking takes several seats, up to metadata.max_seats (default 10).
export function isDepartureService(product: { metadata?: Meta } | null | undefined): boolean {
  return product?.metadata?.booking_kind === "D"
}
export function maxSeats(product: { metadata?: Meta } | null | undefined): number {
  const n = Number(product?.metadata?.max_seats)
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : 10
}

// An event sold by section (kind F, TASKS P3-24): product metadata.booking_kind
// "F"; each variant is a date and a section with its seats as inventory.
export function isEventProduct(product: { metadata?: Meta } | null | undefined): boolean {
  return product?.metadata?.booking_kind === "F"
}

// Extras on a booking (TASKS P3-25): a product with metadata.booking_extra
// is added only with a booking; a service lists the extras it offers by
// handle in metadata.extras.
export function isExtraProduct(product: { metadata?: Meta } | null | undefined): boolean {
  return product?.metadata?.booking_extra === true
}
export function offeredExtras(product: { metadata?: Meta } | null | undefined): string[] {
  const raw = product?.metadata?.extras
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : []
  return list.map((h) => String(h).trim()).filter(Boolean)
}
/** The booking an extra line belongs to, if it is one. */
export function extraFor(item: { metadata?: Meta } | null | undefined): string | null {
  const id = item?.metadata?.booking_extra_for
  return typeof id === "string" && id ? id : null
}

// Deposits (TASKS P3-26): a service's product metadata.deposit_percent (1-99)
// is paid at checkout, the rest at the shop or venue.
export function depositPercent(product: { metadata?: Meta } | null | undefined): number | null {
  const n = Number(product?.metadata?.deposit_percent)
  return Number.isFinite(n) && n >= 1 && n <= 99 ? n : null
}

/** What is paid now and left for later, as the backend computes it. */
export function depositSplit(
  items: { total?: number | null; product?: { metadata?: Meta } | null }[] | null | undefined
): { now: number; later: number } | null {
  const lines = (items ?? []).map((i) => ({ total: Number(i.total ?? 0), percent: depositPercent(i.product) }))
  if (!lines.some((l) => l.percent !== null)) {
    return null
  }
  const now = Math.round(lines.reduce((s, l) => s + (l.percent === null ? l.total : (l.total * l.percent) / 100), 0) * 100) / 100
  const total = Math.round(lines.reduce((s, l) => s + l.total, 0) * 100) / 100
  return { now, later: Math.round((total - now) * 100) / 100 }
}

export function isServiceProduct(product: HttpTypes.StoreProduct): boolean {
  return (product.variants ?? []).some((v) => durationMinutes(v) !== null)
}

// What the customer chooses between a service's variants (TASKS P3-19): the
// product's own option, e.g. "Length" for a haircut or "Party size" for a
// table reservation.
export function serviceChoiceLabel(product: { options?: { title?: string | null }[] | null }): string {
  return product.options?.find((o) => o?.title)?.title ?? "Option"
}

// A service's variants in a stable order: by party size, then length, then
// title (the Store API doesn't promise an order).
export function orderedServices<V extends { title?: string | null; metadata?: Meta }>(variants: V[]): V[] {
  const size = (v: V) => Number(v.metadata?.party_size) || 0
  return [...variants].sort(
    (a, b) =>
      size(a) - size(b) ||
      (durationMinutes(a) ?? 0) - (durationMinutes(b) ?? 0) ||
      (a.title ?? "").localeCompare(b.title ?? "")
  )
}

// Every item is a booked service (no item needs shipping): checkout has no
// address or delivery step, only contact (backend F-048).
// Works for a cart or an order (both have items with requires_shipping).
export function isServiceOnlyCart(
  cart: { items?: { requires_shipping?: boolean | null }[] | null } | null | undefined
): boolean {
  const items = cart?.items ?? []
  return items.length > 0 && items.every((i) => i.requires_shipping === false)
}

export type ItemBooking = {
  starts_at: string
  ends_at: string
  resource: string | null
  timezone: string | null
  // Where a visit at the customer's place is (kind B, TASKS P3-20); a trip's pickup.
  address: string | null
  // A trip (kind C, TASKS P3-21): drop-off and what was priced.
  dropoff: string | null
  trip: string | null
  // A rental (kind E, P3-22): shown by its dates (in `trip`), not by times.
  wholeDays: boolean
  // Seats on a departure (kind D, P3-23); 1 for everything else.
  seats: number
}

export function itemBooking(item: { metadata?: Meta } | null | undefined): ItemBooking | null {
  const m = item?.metadata
  if (typeof m?.booking_id !== "string" || typeof m?.booking_starts_at !== "string") {
    return null
  }
  return {
    starts_at: m.booking_starts_at,
    ends_at: String(m.booking_ends_at ?? m.booking_starts_at),
    resource: typeof m.booking_resource_name === "string" ? m.booking_resource_name : null,
    timezone: typeof m.booking_timezone === "string" ? m.booking_timezone : null,
    address: typeof m.booking_address === "string" ? m.booking_address : null,
    dropoff: typeof m.booking_dropoff_address === "string" ? m.booking_dropoff_address : null,
    trip: typeof m.booking_trip === "string" ? m.booking_trip : null,
    wholeDays: m.booking_whole_days === true,
    seats: Number.isInteger(Number(m.booking_seats)) && Number(m.booking_seats) > 1 ? Number(m.booking_seats) : 1,
  }
}

// "Mon 9 Nov, 10:00–11:00" in the given zone (the resource's), built from
// parts so the text is the same on every Node / browser version.
export function formatBookingRange(starts_at: string, ends_at: string, timeZone?: string | null): string {
  const zone = timeZone || undefined
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: zone, weekday: "short", day: "numeric", month: "short" })
      .formatToParts(new Date(starts_at))
      .map((p) => [p.type, p.value])
  )
  const time = (at: string) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
      new Date(at)
    )
  return `${parts.weekday} ${parts.day} ${parts.month}, ${time(starts_at)}–${time(ends_at)}`
}

export function formatSlotTime(at: string, timeZone?: string | null): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timeZone || undefined,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(at))
}

// "YYYY-MM-DD" of `now` plus `days` in the zone (for the date picker).
export function localDate(timeZone: string | null | undefined, days = 0, now = new Date()): string {
  const at = new Date(now.getTime() + days * 24 * 3600 * 1000)
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: timeZone || undefined, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(at)
      .map((p) => [p.type, p.value])
  )
  return `${parts.year}-${parts.month}-${parts.day}`
}

// One status line for a service order's bookings (P3-13): "Confirmed",
// "Cancelled", or e.g. "1 confirmed, 1 cancelled" when they differ. A
// cancelled order counts as cancelled; no bookings known → "Booked".
export function bookingStatusLabel(statuses: string[], orderStatus?: string | null): string {
  const label = (s: string) => {
    const t = s === "no_show" ? "no-show" : s === "pending" ? "held" : s
    return t.charAt(0).toUpperCase() + t.slice(1)
  }
  if (orderStatus === "canceled") {
    return "Cancelled"
  }
  if (!statuses.length) {
    return "Booked"
  }
  const counts = new Map<string, number>()
  for (const s of statuses) {
    counts.set(s, (counts.get(s) ?? 0) + 1)
  }
  if (counts.size === 1) {
    return label(statuses[0])
  }
  return Array.from(counts.entries()).map(([s, n]) => `${n} ${label(s).toLowerCase()}`).join(", ")
}

// Quote first (TASKS P3-27): priced on request, booked from an accepted quote.
export function isQuoteOnly(product: HttpTypes.StoreProduct): boolean {
  return (product.metadata as Record<string, unknown> | null)?.quote_only === true
}
