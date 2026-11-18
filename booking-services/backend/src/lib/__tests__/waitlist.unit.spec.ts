import { localDate, waitlistDateOk, waitlistEmail, waitlistService } from "../waitlist"

const now = new Date("2026-11-18T20:00:00Z") // 19 Nov, 03:00 in Phnom Penh

describe("waitlist rules (TASKS P3-29)", () => {
  it("takes days from the local today up to 90 days ahead", () => {
    expect(localDate(now, "Asia/Phnom_Penh")).toBe("2026-11-19")
    expect(waitlistDateOk("2026-11-19", now, "Asia/Phnom_Penh")).toBe(true)
    expect(waitlistDateOk("2026-11-18", now, "Asia/Phnom_Penh")).toBe(false)
    expect(waitlistDateOk("2027-02-17", now, "Asia/Phnom_Penh")).toBe(true)
    expect(waitlistDateOk("2027-02-18", now, "Asia/Phnom_Penh")).toBe(false)
    expect(waitlistDateOk("19/11/2026", now, "Asia/Phnom_Penh")).toBe(false)
  })

  it("is for time-slot services only", () => {
    expect(waitlistService({})).toBe(true)
    expect(waitlistService({ booking_kind: "B" })).toBe(true)
    expect(waitlistService({ quote_only: true })).toBe(false)
    expect(waitlistService({ booking_kind: "E" })).toBe(false)
    expect(waitlistService({ booking_kind: "F" })).toBe(false)
    expect(waitlistService({ booking_extra: true })).toBe(false)
  })

  it("writes the email with the free times", () => {
    const e = waitlistEmail({ service: "Haircut", date: "2026-11-25", times: ["09:00", "10:30"], url: "https://shop/x" }, (s) => s)
    expect(e.subject).toBe("A time is free: Haircut, Wednesday 25 November")
    expect(e.html).toContain("09:00, 10:30")
    expect(e.html).toContain('href="https://shop/x"')
  })
})
