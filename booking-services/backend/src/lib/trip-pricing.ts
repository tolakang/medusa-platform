import { MathBN } from "@medusajs/framework/utils"

// Trip pricing (kind C, TASKS P3-21, plan D12). Pure, unit-tested in
// __tests__/trip-pricing.unit.spec.ts. A trip service's product has
// metadata.booking_kind "C" and metadata.trip_pricing:
// - "hours": the variant (a vehicle size) is priced per hour; the customer
//   books whole hours, from the variant's metadata.min_hours (default 1) to
//   MAX_TRIP_HOURS;
// - "zones": a price table between areas per vehicle size (booking_zone_price),
//   each row with the trip's length in minutes.
// "distance" (a maps provider) comes later (owner, 2026-11-17).

export type TripPricing = "hours" | "zones"
export const TRIP_KIND = "C"
export const MAX_TRIP_HOURS = 12

type Meta = Record<string, unknown> | null | undefined

export function tripPricing(product: { metadata?: Meta } | null | undefined): TripPricing | null {
  if (product?.metadata?.booking_kind !== TRIP_KIND) {
    return null
  }
  const mode = product.metadata?.trip_pricing
  return mode === "hours" || mode === "zones" ? mode : null
}

export function minHours(variant: { metadata?: Meta } | null | undefined): number {
  const n = Number(variant?.metadata?.min_hours)
  return Number.isInteger(n) && n >= 1 && n <= MAX_TRIP_HOURS ? n : 1
}

/** The hours asked for, if allowed for this vehicle; else null. */
export function validHours(hours: unknown, variant: { metadata?: Meta } | null | undefined): number | null {
  const n = Number(hours)
  return Number.isInteger(n) && n >= minHours(variant) && n <= MAX_TRIP_HOURS ? n : null
}

/** The hourly price × hours, rounded to cents. */
export function hoursPrice(hourly: number | string, hours: number): number {
  return MathBN.convert(MathBN.mult(hourly, hours), 2).toNumber()
}

type ZonePrice = { from_zone_id: string; to_zone_id: string; amount: unknown; minutes: number; currency_code: string }

/** The price row between two zones, in either direction. */
export function zonePriceBetween<T extends ZonePrice>(rows: T[], a: string, b: string): T | null {
  return rows.find((r) => (r.from_zone_id === a && r.to_zone_id === b) || (r.from_zone_id === b && r.to_zone_id === a)) ?? null
}
