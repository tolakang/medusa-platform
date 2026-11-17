import { movedEnd, moveDecision, MOVE_NOT_ALLOWED_MESSAGE, MOVE_STARTED_MESSAGE, MOVE_TOO_LATE_MESSAGE } from "../booking-move"

const now = new Date("2026-11-20T00:00:00Z")
const at = (h: number) => new Date(now.getTime() + h * 3600_000)
const b = (status: string, startH: number, endH = startH + 1) => ({ status, starts_at: at(startH), ends_at: at(endH) })

describe("moveDecision (TASKS P3-28)", () => {
  it("lets a customer move a confirmed booking until the cancel cutoff", () => {
    expect(moveDecision(b("confirmed", 48), now, "customer", 24)).toEqual({ allowed: true })
    expect(moveDecision(b("confirmed", 24), now, "customer", 24)).toEqual({ allowed: true })
    expect(moveDecision(b("confirmed", 23), now, "customer", 24)).toEqual({ allowed: false, message: MOVE_TOO_LATE_MESSAGE })
    expect(moveDecision(b("confirmed", -1), now, "customer", 24)).toEqual({ allowed: false, message: MOVE_STARTED_MESSAGE })
    expect(moveDecision(b("pending", 48), now, "customer", 24)).toEqual({ allowed: false, message: MOVE_NOT_ALLOWED_MESSAGE })
    expect(moveDecision(b("cancelled", 48), now, "customer", 24)).toEqual({ allowed: false, message: MOVE_NOT_ALLOWED_MESSAGE })
  })

  it("lets staff move pending or confirmed bookings until they end", () => {
    expect(moveDecision(b("confirmed", 1), now, "staff", 24)).toEqual({ allowed: true })
    expect(moveDecision(b("pending", -1, 1), now, "staff", 24)).toEqual({ allowed: true })
    expect(moveDecision(b("confirmed", -2, -1), now, "staff", 24)).toEqual({ allowed: false, message: MOVE_STARTED_MESSAGE })
    expect(moveDecision(b("expired", 5), now, "staff", 24)).toEqual({ allowed: false, message: MOVE_NOT_ALLOWED_MESSAGE })
  })

  it("keeps the length", () => {
    expect(movedEnd(b("confirmed", 0, 2), at(10))).toEqual(at(12))
  })
})
