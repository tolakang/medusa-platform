import { jobMessage } from "../booking-job"

const base = {
  calendar: "Vannak",
  timezone: "Asia/Phnom_Penh",
  starts_at: "2026-11-25T02:00:00.000Z",
  ends_at: "2026-11-25T03:30:00.000Z",
}

describe("jobMessage (TASKS P3-28)", () => {
  it("writes a new job with the customer, place and notes in the calendar's zone", () => {
    expect(
      jobMessage({ ...base, kind: "new", service: "Air conditioner service", customer: "Sok Chan", phone: "012 345 678", address: "#12, St 310", notes: "Leaking water", order: 7 })
    ).toBe(
      "🗓 New job: Air conditioner service\nWed 25 Nov, 09:00–10:30 · Vannak\nCustomer: Sok Chan, 012 345 678\nAt: #12, St 310\nNotes: Leaking water\nOrder #7"
    )
  })

  it("says where a moved job was, and keeps a removed one short", () => {
    const previous = { calendar: "Sophea", starts_at: "2026-11-24T02:00:00.000Z" }
    expect(jobMessage({ ...base, kind: "moved", address: "A", dropoff_address: "B", seats: 3, previous })).toBe(
      "🔁 Job moved\nWed 25 Nov, 09:00–10:30 · Vannak\nWas: Tue 24 Nov, 09:00 · Sophea\nFrom: A\nTo: B\nSeats: 3"
    )
    expect(jobMessage({ ...base, kind: "removed", customer: "Sok", calendar: "Sophea" })).toBe(
      "➖ Job taken off your calendar\nWed 25 Nov, 09:00–10:30 · Sophea"
    )
  })
})
