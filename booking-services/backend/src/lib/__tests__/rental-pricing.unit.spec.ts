import { addDays, rentalLabel, rentalPrice, rentalSpan, rentalUnit, rentalUnits } from "../rental-pricing"

// TASKS P3-22: rental rules.
describe("rental pricing", () => {
  it("reads the unit of a rental service only", () => {
    expect(rentalUnit({ metadata: { booking_kind: "E", rental_unit: "day" } })).toBe("day")
    expect(rentalUnit({ metadata: { booking_kind: "E", rental_unit: "night" } })).toBe("night")
    expect(rentalUnit({ metadata: { booking_kind: "E" } })).toBeNull()
    expect(rentalUnit({ metadata: { booking_kind: "C", rental_unit: "day" } })).toBeNull()
  })

  it("counts days inclusive and nights between check-in and check-out", () => {
    expect(rentalUnits("day", "2026-11-23", "2026-11-25")).toBe(3)
    expect(rentalUnits("day", "2026-11-23", "2026-11-23")).toBe(1)
    expect(rentalUnits("night", "2026-11-23", "2026-11-25")).toBe(2)
    expect(rentalUnits("night", "2026-11-23", "2026-11-23")).toBeNull()
    expect(rentalUnits("day", "2026-11-25", "2026-11-23")).toBeNull()
    expect(rentalUnits("day", "2026-02-30", "2026-03-02")).toBeNull()
    expect(rentalUnits("day", "23/11/2026", "2026-11-25")).toBeNull()
    expect(rentalUnits("night", "2026-11-01", "2027-01-30")).toBeNull()
    // Across a month and a year end.
    expect(rentalUnits("night", "2026-12-30", "2027-01-02")).toBe(3)
  })

  it("covers whole local days and prices per unit", () => {
    expect(rentalSpan("day", "2026-11-23", "2026-11-25")).toEqual({ from: "2026-11-23", to: "2026-11-26" })
    expect(rentalSpan("night", "2026-11-23", "2026-11-25")).toEqual({ from: "2026-11-23", to: "2026-11-25" })
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01")
    expect(rentalPrice(35, 3)).toBe(105)
    expect(rentalPrice("12.35", 3)).toBe(37.05)
    expect([rentalLabel("day", 1), rentalLabel("day", 3), rentalLabel("night", 1), rentalLabel("night", 2)]).toEqual([
      "1 day",
      "3 days",
      "1 night",
      "2 nights",
    ])
  })
})
