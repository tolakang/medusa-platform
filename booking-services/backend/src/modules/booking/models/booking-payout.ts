import { model } from "@medusajs/framework/utils"
import { BookingProvider } from "./booking-provider"

// What the shop owes a partner for one month and currency (TASKS P3-33, as
// Marketplace's vendor_payout). Made by the booking-payouts job; paid outside
// Medusa and marked paid with its reference (manual payouts).
export const BookingPayout = model
  .define("booking_payout", {
    id: model.id({ prefix: "bpay" }).primaryKey(),
    amount: model.bigNumber(),
    currency_code: model.text(),
    // Calendar month the payout covers, "YYYY-MM" (UTC).
    period: model.text(),
    status: model.enum(["pending", "paid", "cancelled"]).default("pending"),
    paid_at: model.dateTime().nullable(),
    reference: model.text().nullable(),
    provider: model.belongsTo(() => BookingProvider, { mappedBy: "payouts" }),
  })
  // One payout per partner, month and currency, so a second run can't pay twice.
  .indexes([{ on: ["provider_id", "period", "currency_code"], unique: true }])
  .checks([
    { name: "booking_payout_amount_not_negative", expression: (c) => `${c.amount} >= 0` },
    { name: "booking_payout_period_format", expression: (c) => `${c.period} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'` },
  ])
