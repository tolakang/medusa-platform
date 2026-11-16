import {
  commissionAmount,
  commissionBase,
  commissionRateFor,
  defaultCommissionRate,
  groupPayouts,
  isPayoutDay,
  payoutCutoff,
  payoutDay,
  payoutPeriod,
  providerPayoutAmount,
} from "../provider-commission"

// TASKS P3-33: commission and payout rules for partner bookings.
describe("provider commission rules", () => {
  it("reads the default rate, else 10", () => {
    expect(defaultCommissionRate({})).toBe(10)
    expect(defaultCommissionRate({ BOOKING_DEFAULT_COMMISSION_RATE: "12.5" })).toBe(12.5)
    expect(defaultCommissionRate({ BOOKING_DEFAULT_COMMISSION_RATE: "101" })).toBe(10)
    expect(defaultCommissionRate({ BOOKING_DEFAULT_COMMISSION_RATE: " " })).toBe(10)
  })

  it("uses the partner's own rate first", () => {
    expect(commissionRateFor({ commission_rate: 0 }, {})).toBe(0)
    expect(commissionRateFor({ commission_rate: null }, { BOOKING_DEFAULT_COMMISSION_RATE: "8" })).toBe(8)
  })

  it("takes the commission on the booking's line without tax", () => {
    expect(commissionBase({ total: 11, tax_total: 1 })).toBe(10)
    expect(commissionBase({ total: 5, tax_total: 10 })).toBe(0)
    expect(commissionAmount(18, 12.5)).toBe(2.25)
    expect(commissionAmount(33.33, 10)).toBe(3.33)
    expect(commissionAmount(0, 10)).toBe(0)
  })

  it("owes the partner the line total minus the commission", () => {
    expect(providerPayoutAmount(18, 2.25)).toBe(15.75)
    expect(providerPayoutAmount(1, 2)).toBe(0)
  })

  it("pays on BOOKING_PAYOUT_DAY for the month before", () => {
    expect(payoutDay({})).toBe(1)
    expect(payoutDay({ BOOKING_PAYOUT_DAY: "15" })).toBe(15)
    expect(payoutDay({ BOOKING_PAYOUT_DAY: "31" })).toBe(1)
    const day = new Date("2026-12-15T02:00:00Z")
    expect(isPayoutDay(day, { BOOKING_PAYOUT_DAY: "15" })).toBe(true)
    expect(isPayoutDay(day, {})).toBe(false)
    expect(payoutCutoff(day).toISOString()).toBe("2026-12-01T00:00:00.000Z")
    expect(payoutPeriod(day)).toBe("2026-11")
    expect(payoutPeriod(new Date("2027-01-01T00:00:00Z"))).toBe("2026-12")
  })

  it("groups commissions into one payout per partner and currency", () => {
    expect(
      groupPayouts([
        { id: "c1", provider_id: "p2", currency_code: "usd", payout_amount: 10.1 },
        { id: "c2", provider_id: "p1", currency_code: "usd", payout_amount: 5 },
        { id: "c3", provider_id: "p2", currency_code: "usd", payout_amount: 0.2 },
        { id: "c4", provider_id: "p2", currency_code: "khr", payout_amount: 4000 },
      ])
    ).toEqual([
      { provider_id: "p1", currency_code: "usd", amount: 5, commission_ids: ["c2"] },
      { provider_id: "p2", currency_code: "khr", amount: 4000, commission_ids: ["c4"] },
      { provider_id: "p2", currency_code: "usd", amount: 10.3, commission_ids: ["c1", "c3"] },
    ])
  })
})
