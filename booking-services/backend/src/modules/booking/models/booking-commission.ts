import { model } from "@medusajs/framework/utils"
import { BookingProvider } from "./booking-provider"

// What the shop keeps of one partner booking, and what it owes the partner
// for it (TASKS P3-33, plan §9.3 "Money", as Marketplace's
// vendor_commission). One per booking (`booking_id` unique); staff bookings
// have none. Order and line item ids are plain text (no keys into core
// tables).
export const BookingCommission = model
  .define("booking_commission", {
    id: model.id({ prefix: "bcom" }).primaryKey(),
    booking_id: model.text(),
    order_id: model.text(),
    line_item_id: model.text().nullable(),
    // The booking's line total (with tax), copied when recorded.
    line_total: model.bigNumber(),
    // What the commission is taken on: the line without tax.
    base: model.bigNumber(),
    // Percent applied, 0 to 100.
    rate: model.float(),
    // The shop's commission: base × rate.
    amount: model.bigNumber(),
    // What the partner is owed: line_total − amount.
    payout_amount: model.bigNumber(),
    currency_code: model.text(),
    // pending: recorded at checkout; approved: in a payout not yet paid;
    // paid: that payout was paid; cancelled: the booking or order was
    // cancelled (and refunded) before its payout.
    status: model.enum(["pending", "approved", "paid", "cancelled"]).default("pending"),
    payout_id: model.text().nullable(),
    // What the customer got back when this booking was cancelled with a
    // refund, so other refunds on the order can be told apart.
    refunded_amount: model.bigNumber().default(0),
    // Refunds the booking cancel doesn't explain (an admin refund on the
    // order) hold the order's commissions: to_review until the admin
    // settles them (keep or cancel); settled: the next payout includes a
    // kept one.
    refund_review: model.enum(["none", "to_review", "settled"]).default("none"),
    provider: model.belongsTo(() => BookingProvider, { mappedBy: "commissions" }),
  })
  .indexes([{ on: ["booking_id"], unique: true }, { on: ["order_id"] }])
  .checks([
    {
      name: "booking_commission_rate_percent",
      expression: (columns) => `${columns.rate} >= 0 AND ${columns.rate} <= 100`,
    },
    {
      name: "booking_commission_amounts_not_negative",
      expression: (columns) =>
        `${columns.amount} >= 0 AND ${columns.base} >= 0 AND ${columns.line_total} >= 0 AND ${columns.payout_amount} >= 0`,
    },
  ])
