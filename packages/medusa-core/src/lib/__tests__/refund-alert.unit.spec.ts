import {
  refundAlertData,
  refundAlertStaffMessage,
  type RefundAlertPayment,
} from "../refund-alert"

const payment = (refunds: RefundAlertPayment["refunds"]): RefundAlertPayment => ({
  id: "pay_1",
  amount: 166.5,
  currency_code: "usd",
  refunds,
  payment_collection: {
    order: {
      id: "order_1",
      display_id: 4,
      email: "customer@example.com",
      shipping_address: { first_name: "Dara", last_name: "Sok", phone: "+855 12 345 678" },
    },
  },
})

describe("refund alert", () => {
  it("describes the newest refund and the total refunded", () => {
    const data = refundAlertData(
      payment([
        { id: "ref_1", amount: 20, created_at: "2026-11-15T01:00:00Z" },
        {
          id: "ref_2",
          amount: 146.5,
          created_at: "2026-11-15T01:13:47Z",
          note: "Wrong price",
          refund_reason: { label: "Pricing Error" },
        },
      ])
    )
    expect(data).toEqual({
      order: {
        id: "order_1",
        display_id: 4,
        email: "customer@example.com",
        name: "Dara Sok",
        phone: "+855 12 345 678",
      },
      refund: { id: "ref_2", amount: 146.5, reason: "Pricing Error", note: "Wrong price" },
      currency_code: "usd",
      refunded_total: 166.5,
      payment_amount: 166.5,
    })
    expect(refundAlertStaffMessage(data)).toBe(
      [
        "💸 Refund on order #4 — $146.50",
        "Reason: Pricing Error",
        "Note: Wrong price",
        "Refunded so far: $166.50 of $166.50 paid",
        "Customer: Dara Sok, customer@example.com",
        "Phone: +855 12 345 678",
      ].join("\n")
    )
  })

  it("leaves out what the order doesn't have (a till sale has no address)", () => {
    const p = payment([{ id: "ref_1", amount: 45 }])
    p.payment_collection!.order = { id: "order_2", display_id: 7 }
    expect(refundAlertStaffMessage(refundAlertData(p))).toBe(
      ["💸 Refund on order #7 — $45.00", "Refunded so far: $45.00 of $166.50 paid"].join("\n")
    )
  })

  it("sends nothing without an order or a refund", () => {
    expect(refundAlertData(undefined)).toBeNull()
    expect(refundAlertData(payment([]))).toBeNull()
    const p = payment([{ id: "ref_1", amount: 5 }])
    p.payment_collection = null
    expect(refundAlertData(p)).toBeNull()
  })
})
