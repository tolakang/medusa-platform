import { balanceReminderEmail, depositNow, depositPercent, reminderDays } from "../deposits"

// TASKS P3-26: deposit rules.
describe("deposits", () => {
  it("reads a service's deposit percent", () => {
    expect(depositPercent({ metadata: { deposit_percent: 30 } })).toBe(30)
    expect(depositPercent({ metadata: { deposit_percent: "25" } })).toBe(25)
    expect(depositPercent({ metadata: { deposit_percent: 100 } })).toBeNull()
    expect(depositPercent({ metadata: { deposit_percent: 0 } })).toBeNull()
    expect(depositPercent({ metadata: null })).toBeNull()
  })

  it("takes the deposit share of deposit lines and other lines in full", () => {
    expect(depositNow([{ total: 100, percent: 30 }])).toBe(30)
    expect(depositNow([{ total: 100, percent: 30 }, { total: 6, percent: null }])).toBe(36)
    expect(depositNow([{ total: 33.33, percent: 30 }])).toBe(10)
    expect(depositNow([{ total: 15, percent: null }])).toBe(15)
  })

  it("reminds a set number of days before, and says what is due", () => {
    expect(reminderDays({})).toBe(2)
    expect(reminderDays({ BOOKING_BALANCE_REMINDER_DAYS: "5" })).toBe(5)
    expect(reminderDays({ BOOKING_BALANCE_REMINDER_DAYS: "40" })).toBe(2)
    const { subject, html } = balanceReminderEmail(
      { order_display_id: 7, customer_name: "Sok", amount: 70, currency_code: "usd", due_at: "2026-11-23T01:00:00.000Z" },
      (s) => s
    )
    expect(subject).toBe("Balance of $70.00 due by 2026-11-23")
    expect(html).toContain("order #7")
  })
})

describe("payment plan (TASKS P3-30)", () => {
  const { paymentPlan, instalmentsDue, depositPercent } = jest.requireActual("../deposits")
  const plan = [{ percent: 30 }, { percent: 40, days_before: 30 }, { percent: 30, days_before: 7 }]

  it("reads instalments that add up to 100%, furthest first", () => {
    expect(paymentPlan({ payment_plan: plan })).toEqual([
      { percent: 30, days_before: null },
      { percent: 40, days_before: 30 },
      { percent: 30, days_before: 7 },
    ])
    expect(depositPercent({ metadata: { payment_plan: plan, deposit_percent: 50 } })).toBe(30)
    expect(paymentPlan({ payment_plan: [{ percent: 30 }, { percent: 60, days_before: 7 }] })).toBeNull()
    expect(paymentPlan({ payment_plan: [{ percent: 50 }, { percent: 20, days_before: 7 }, { percent: 30, days_before: 30 }] })).toBeNull()
    expect(paymentPlan({ payment_plan: [{ percent: 100 }] })).toBeNull()
  })

  it("splits the rest with the rounding on the last, due before the event but not before now", () => {
    const event = new Date("2027-03-01T02:00:00Z")
    expect(instalmentsDue(100.01, paymentPlan({ payment_plan: plan }), event, new Date("2026-11-20T00:00:00Z"))).toEqual([
      { amount: 40, due_at: "2027-01-30T02:00:00.000Z" },
      { amount: 30.01, due_at: "2027-02-22T02:00:00.000Z" },
    ])
    // Booked late: both dates have passed, so both are due now.
    const soon = new Date("2027-02-25T00:00:00Z")
    expect(instalmentsDue(150, paymentPlan({ payment_plan: plan }), event, soon).map((i: any) => i.due_at)).toEqual([
      soon.toISOString(),
      soon.toISOString(),
    ])
  })
})
