import {
  adjustCommission,
  clawbackAmount,
  keptBase,
  commissionAmount,
  commissionBase,
  commissionRateFor,
  currencyDecimals,
  defaultCommissionRate,
  roundToCurrency,
} from "../../modules/seller/commission"

// TASKS P5-04: commission rates, amounts and adjustments.

describe("commission rate", () => {
  it("is the seller's own, else the shop default", () => {
    expect(commissionRateFor({ commission_rate: 12.5 }, {})).toEqual(12.5)
    expect(commissionRateFor({ commission_rate: 0 }, {})).toEqual(0)
    expect(
      commissionRateFor({ commission_rate: null }, { RESELLER_DEFAULT_COMMISSION_RATE: "7" })
    ).toEqual(7)
  })

  it.each([undefined, "", "abc", "-1", "101"])(
    "falls back to 10 for RESELLER_DEFAULT_COMMISSION_RATE=%p",
    (raw) => {
      expect(defaultCommissionRate({ RESELLER_DEFAULT_COMMISSION_RATE: raw })).toEqual(10)
    }
  )
})

describe("commission amount", () => {
  it.each([
    [200, 10, 20],
    [99.99, 12.5, 12.5],
    [33.33, 10, 3.33],
    [100, 0, 0],
    [0, 10, 0],
    [-5, 10, 0],
  ])("%p at %p%% is %p", (base, rate, amount) => {
    expect(commissionAmount(base, rate)).toEqual(amount)
  })
})

describe("adjust on cancel or refund", () => {
  const pending = { status: "pending", order_total: 200, rate: 10, amount: 20 }

  it("a cancelled order cancels a pending or approved commission", () => {
    expect(adjustCommission(pending, { kind: "canceled" })).toEqual({ action: "cancel" })
    expect(
      adjustCommission({ ...pending, status: "approved" }, { kind: "canceled" })
    ).toEqual({ action: "cancel" })
  })

  it("a partial refund recalculates on what the shop kept", () => {
    expect(adjustCommission(pending, { kind: "refunded", refunded_total: 50 })).toEqual({
      action: "amount",
      amount: 15,
    })
  })

  it("a full refund cancels it", () => {
    expect(adjustCommission(pending, { kind: "refunded", refunded_total: 200 })).toEqual({
      action: "cancel",
    })
  })

  it("leaves paid and cancelled commissions alone", () => {
    expect(adjustCommission({ ...pending, status: "paid" }, { kind: "canceled" })).toEqual({
      action: "none",
      reason: "already paid out",
    })
    expect(
      adjustCommission({ ...pending, status: "cancelled" }, { kind: "refunded", refunded_total: 1 })
    ).toEqual({ action: "none", reason: "already cancelled" })
  })

  // P5-12: the base is the items; a refund is of the whole order (items,
  // shipping, tax), so the commission keeps the share the shop kept.
  it("a refund of part of the whole order keeps that share of the item base", () => {
    // Items 200 of an order of 250 (shipping and tax 50); 125 refunded = half.
    expect(
      adjustCommission(pending, { kind: "refunded", refunded_total: 125, order_grand_total: 250 })
    ).toEqual({ action: "amount", amount: 10 })
    expect(
      adjustCommission(pending, { kind: "refunded", refunded_total: 250, order_grand_total: 250 })
    ).toEqual({ action: "cancel" })
  })

  it("changes nothing when the refund is 0", () => {
    expect(adjustCommission(pending, { kind: "refunded", refunded_total: 0 })).toEqual({
      action: "none",
      reason: "unchanged",
    })
  })
})

describe("commission base (D11, TASKS P5-12)", () => {
  it("is the items after discounts, without tax and shipping", () => {
    // item_total is after discounts with tax.
    expect(commissionBase({ item_total: 110, item_tax_total: 10 })).toEqual(100)
    expect(commissionBase({ item_total: 33.335, item_tax_total: 0 })).toEqual(33.34)
    expect(commissionBase({ item_total: 0, item_tax_total: 0 })).toEqual(0)
    expect(commissionBase({})).toEqual(0)
  })
})

// Owner 2026-11-25: amounts round to the currency's minor units (KHR 0, USD 2).
describe("rounding to the currency", () => {
  it("knows each currency's decimals", () => {
    expect(currencyDecimals("khr")).toBe(0)
    expect(currencyDecimals("usd")).toBe(2)
    expect(currencyDecimals(null)).toBe(2)
    expect(currencyDecimals("??")).toBe(2)
    expect(roundToCurrency(999.6, "khr")).toBe(1000)
  })

  it("rounds a riel commission to whole riel and a dollar one to cents", () => {
    expect(commissionBase({ item_total: 20500.7, item_tax_total: 0, currency_code: "khr" })).toBe(20501)
    expect(commissionAmount(20501, 12.5, "khr")).toBe(2563)
    expect(commissionAmount(33.33, 10, "usd")).toBe(3.33)
    expect(
      adjustCommission(
        { status: "pending", order_total: 10000, rate: 12.5, amount: 1250, currency_code: "khr" },
        { kind: "refunded", refunded_total: 333 }
      )
    ).toEqual({ action: "amount", amount: 1208 })
  })
})

describe("clawback of a paid commission", () => {
  const paid = { order_total: 100, rate: 10, amount: 10, currency_code: "usd" }

  it("takes the whole commission back when the order is cancelled", () => {
    expect(clawbackAmount(paid, { kind: "canceled" })).toEqual(-10)
  })

  it("takes back the refunded share, and only what is new", () => {
    // Half the order refunded: 5 of the 10 paid is taken back.
    const half = { kind: "refunded" as const, refunded_total: 50, order_grand_total: 100 }
    expect(clawbackAmount(paid, half)).toEqual(-5)
    expect(clawbackAmount(paid, half, -5)).toEqual(0)
    // Then the rest: the other 5.
    const all = { kind: "refunded" as const, refunded_total: 100, order_grand_total: 100 }
    expect(clawbackAmount(paid, all, -5)).toEqual(-5)
  })

  it("never gives money back", () => {
    expect(clawbackAmount(paid, { kind: "refunded", refunded_total: 0 })).toEqual(0)
  })
})

describe("base kept after a refund", () => {
  it("is the base's share of what the customer still paid", () => {
    expect(keptBase(100, { refunded_total: 55, order_grand_total: 110 })).toEqual(50)
    expect(keptBase(100, { refunded_total: 110, order_grand_total: 110 })).toEqual(0)
    expect(keptBase(100, { refunded_total: 0 })).toEqual(100)
  })
})
