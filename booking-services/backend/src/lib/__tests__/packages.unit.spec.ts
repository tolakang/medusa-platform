import { addDays, eventDateOk, packageComplete, packagePieces } from "../packages"

describe("event packages (TASKS P3-30)", () => {
  it("reads the pieces from Metadata", () => {
    expect(
      packagePieces({ package_items: [{ sku: "HAIRCUT-60", time: "09:00" }, { sku: "TENT-50", day: 0, days: 1 }, { sku: "TABLE-6", day: 1, time: "18:00" }] })
    ).toEqual([
      { sku: "HAIRCUT-60", day: 0, time: "09:00" },
      { sku: "TENT-50", day: 0, days: 1 },
      { sku: "TABLE-6", day: 1, time: "18:00" },
    ])
    expect(packagePieces({ package_items: [{ sku: "X", time: "25:00" }] })).toBeNull()
    expect(packagePieces({ package_items: [{ sku: "X" }] })).toBeNull()
    expect(packagePieces({ package_items: [] })).toBeNull()
    expect(packagePieces({})).toBeNull()
  })

  it("takes event dates from tomorrow up to a year", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01")
    expect(eventDateOk("2026-11-19", "2026-11-18")).toBe(true)
    expect(eventDateOk("2026-11-18", "2026-11-18")).toBe(false)
    expect(eventDateOk("2027-11-18", "2026-11-18")).toBe(true)
    expect(eventDateOk("2027-11-19", "2026-11-18")).toBe(false)
  })

  it("needs the package line and all its pieces", () => {
    const want = new Map([["p1", 2]])
    const line = (is_package: boolean) => ({ package_id: "p1", is_package })
    expect(packageComplete([line(true), line(false), line(false)], want)).toBe(true)
    expect(packageComplete([line(true), line(false)], want)).toBe(false)
    expect(packageComplete([line(false), line(false)], want)).toBe(false)
    expect(packageComplete([], want)).toBe(true)
  })
})
