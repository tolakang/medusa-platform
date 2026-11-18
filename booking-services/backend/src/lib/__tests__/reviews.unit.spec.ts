import { ratingSummary, reviewable, reviewAuthor } from "../reviews"

const now = new Date("2026-11-20T10:00:00Z")

describe("reviews (TASKS P3-29)", () => {
  it("takes bookings that took place", () => {
    expect(reviewable({ status: "confirmed", ends_at: "2026-11-20T09:00:00Z" }, now)).toBe(true)
    expect(reviewable({ status: "completed", ends_at: "2026-11-20T10:00:00Z" }, now)).toBe(true)
    expect(reviewable({ status: "confirmed", ends_at: "2026-11-20T11:00:00Z" }, now)).toBe(false)
    expect(reviewable({ status: "cancelled", ends_at: "2026-11-19T09:00:00Z" }, now)).toBe(false)
    expect(reviewable({ status: "no_show", ends_at: "2026-11-19T09:00:00Z" }, now)).toBe(false)
  })

  it("shows a first name and last initial", () => {
    expect(reviewAuthor("Sok", "chan")).toBe("Sok C.")
    expect(reviewAuthor("Sok", null)).toBe("Sok")
    expect(reviewAuthor(null, "Chan")).toBe("C.")
    expect(reviewAuthor(" ", "")).toBe("A customer")
  })

  it("averages to one decimal", () => {
    expect(ratingSummary([])).toEqual({ average: null, count: 0 })
    expect(ratingSummary([5, 4, 4])).toEqual({ average: 4.3, count: 3 })
  })
})
