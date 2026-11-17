import { MathBN } from "@medusajs/framework/utils"

// Rentals by dates (kind E, TASKS P3-22, plan §9.3): a service whose product
// has metadata.booking_kind "E" and metadata.rental_unit "day" or "night".
// Pure, unit-tested in __tests__/rental-pricing.unit.spec.ts.
// - day (equipment, costumes, vehicles): from the start date to the end date
//   inclusive; 23 → 25 Nov is 3 days.
// - night (rooms): check-in to check-out; 23 → 25 Nov is 2 nights.
// The variant's price is per day or night; the item (a resource booked by
// whole days) has a capacity = how many the shop has.

export type RentalUnit = "day" | "night"
export const RENTAL_KIND = "E"
export const MAX_RENTAL_UNITS = 60

type Meta = Record<string, unknown> | null | undefined

export function rentalUnit(product: { metadata?: Meta } | null | undefined): RentalUnit | null {
  if (product?.metadata?.booking_kind !== RENTAL_KIND) {
    return null
  }
  const unit = product.metadata?.rental_unit
  return unit === "day" || unit === "night" ? unit : null
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const dayNumber = (date: string) => Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / 86_400_000

export function addDays(date: string, days: number): string {
  return new Date((dayNumber(date) + days) * 86_400_000).toISOString().slice(0, 10)
}

/**
 * How many days or nights from start to end, or null when the dates aren't
 * valid "YYYY-MM-DD", in the wrong order, or longer than MAX_RENTAL_UNITS.
 */
export function rentalUnits(unit: RentalUnit, start: unknown, end: unknown): number | null {
  if (typeof start !== "string" || typeof end !== "string" || !DATE.test(start) || !DATE.test(end)) {
    return null
  }
  if (addDays(start, 0) !== start || addDays(end, 0) !== end) {
    return null
  }
  const n = dayNumber(end) - dayNumber(start) + (unit === "day" ? 1 : 0)
  return Number.isInteger(n) && n >= 1 && n <= MAX_RENTAL_UNITS ? n : null
}

/** The local dates the booking covers: [first, the day after the last). */
export function rentalSpan(unit: RentalUnit, start: string, end: string): { from: string; to: string } {
  return { from: start, to: unit === "day" ? addDays(end, 1) : end }
}

export function rentalPrice(perUnit: number | string, units: number): number {
  return MathBN.convert(MathBN.mult(perUnit, units), 2).toNumber()
}

export function rentalLabel(unit: RentalUnit, units: number): string {
  return `${units} ${unit === "day" ? (units === 1 ? "day" : "days") : units === 1 ? "night" : "nights"}`
}
