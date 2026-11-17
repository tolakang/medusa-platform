import { hoursPrice, minHours, tripPricing, validHours, zonePriceBetween } from "../trip-pricing"

// TASKS P3-21: trip pricing rules.
describe("trip pricing", () => {
  it("reads the pricing mode of a trip service only", () => {
    expect(tripPricing({ metadata: { booking_kind: "C", trip_pricing: "hours" } })).toBe("hours")
    expect(tripPricing({ metadata: { booking_kind: "C", trip_pricing: "zones" } })).toBe("zones")
    expect(tripPricing({ metadata: { booking_kind: "C", trip_pricing: "distance" } })).toBeNull()
    expect(tripPricing({ metadata: { booking_kind: "C" } })).toBeNull()
    expect(tripPricing({ metadata: { booking_kind: "B", trip_pricing: "hours" } })).toBeNull()
    expect(tripPricing(null)).toBeNull()
  })

  it("books whole hours from the vehicle's minimum up to 12", () => {
    expect(minHours({ metadata: { min_hours: 3 } })).toBe(3)
    expect(minHours({ metadata: { min_hours: "x" } })).toBe(1)
    expect(minHours({ metadata: null })).toBe(1)
    expect(validHours(3, { metadata: { min_hours: 3 } })).toBe(3)
    expect(validHours("4", { metadata: { min_hours: 3 } })).toBe(4)
    expect(validHours(2, { metadata: { min_hours: 3 } })).toBeNull()
    expect(validHours(2.5, { metadata: null })).toBeNull()
    expect(validHours(13, { metadata: null })).toBeNull()
    expect(hoursPrice(15, 3)).toBe(45)
    expect(hoursPrice("12.35", 3)).toBe(37.05)
  })

  it("finds a zone price in either direction", () => {
    const rows = [
      { from_zone_id: "town", to_zone_id: "airport", amount: 12, minutes: 45, currency_code: "usd" },
      { from_zone_id: "town", to_zone_id: "temples", amount: 15, minutes: 60, currency_code: "usd" },
    ]
    expect(zonePriceBetween(rows, "airport", "town")?.amount).toBe(12)
    expect(zonePriceBetween(rows, "town", "temples")?.minutes).toBe(60)
    expect(zonePriceBetween(rows, "airport", "temples")).toBeNull()
  })
})
