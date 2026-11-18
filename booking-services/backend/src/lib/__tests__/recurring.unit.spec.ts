import { recurringService, weeklyOccurrences } from "../recurring"

describe("recurring bookings (TASKS P3-29)", () => {
  it("repeats the local time every week", () => {
    const got = weeklyOccurrences(new Date("2026-11-23T02:00:00Z"), new Date("2026-11-23T02:30:00Z"), "Asia/Phnom_Penh", 3)
    expect(got.map((o) => [o.starts_at.toISOString(), o.ends_at.toISOString()])).toEqual([
      ["2026-11-23T02:00:00.000Z", "2026-11-23T02:30:00.000Z"],
      ["2026-11-30T02:00:00.000Z", "2026-11-30T02:30:00.000Z"],
      ["2026-12-07T02:00:00.000Z", "2026-12-07T02:30:00.000Z"],
    ])
  })

  it("keeps the local clock time across a clock change", () => {
    // 09:00 in Berlin: UTC+2 in October, UTC+1 after 25 Oct 2026.
    const got = weeklyOccurrences(new Date("2026-10-19T07:00:00Z"), new Date("2026-10-19T08:00:00Z"), "Europe/Berlin", 2)
    expect(got.map((o) => o.starts_at.toISOString())).toEqual(["2026-10-19T07:00:00.000Z", "2026-10-26T08:00:00.000Z"])
  })

  it("is for single-place time-slot services", () => {
    expect(recurringService({})).toBe(true)
    expect(recurringService({ booking_kind: "B" })).toBe(true)
    for (const k of ["C", "D", "E", "F"]) expect(recurringService({ booking_kind: k })).toBe(false)
    expect(recurringService({ quote_only: true })).toBe(false)
  })
})
