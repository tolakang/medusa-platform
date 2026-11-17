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
