// Scheduled departures (kind D, TASKS P3-23, plan §9.3: bus, van and boat
// routes, tours). A service whose product has metadata.booking_kind "D". Each
// variant is a route with its length in metadata.duration_minutes; a route's
// vehicle is a resource whose weekly hours are its departures (each window
// exactly one trip long) and whose capacity is its seats. A booking takes
// several seats at once, up to the product's metadata.max_seats (default 10).

type Meta = Record<string, unknown> | null | undefined

export const DEPARTURE_KIND = "D"
export const DEFAULT_MAX_SEATS = 10

export const isDepartureService = (product: { metadata?: Meta } | null | undefined) =>
  product?.metadata?.booking_kind === DEPARTURE_KIND

export function maxSeats(product: { metadata?: Meta } | null | undefined): number {
  const n = Number(product?.metadata?.max_seats)
  return Number.isInteger(n) && n >= 1 && n <= 100 ? n : DEFAULT_MAX_SEATS
}

/** The seats asked for, if allowed; else null. Missing = 1. */
export function validSeats(seats: unknown, product: { metadata?: Meta } | null | undefined): number | null {
  if (seats === undefined || seats === null) {
    return 1
  }
  const n = Number(seats)
  return Number.isInteger(n) && n >= 1 && n <= maxSeats(product) ? n : null
}
