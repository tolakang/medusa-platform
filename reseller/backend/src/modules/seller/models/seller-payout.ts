import { model } from "@medusajs/framework/utils"
import { Seller } from "./seller"

// A payout the shop made to a seller (outside Medusa) and recorded with
// "Mark paid": the history the owner and the seller see. `amount` = the paid
// commissions plus the adjustments it settled.
export const SellerPayout = model.define("seller_payout", {
  id: model.id({ prefix: "spay" }).primaryKey(),
  currency_code: model.text(),
  amount: model.bigNumber(),
  commission_total: model.bigNumber(),
  adjustment_total: model.bigNumber(),
  commission_count: model.number(),
  // The bank or ABA transaction id, so both sides can find the transfer.
  reference: model.text().nullable(),
  paid_at: model.dateTime(),
  seller: model.belongsTo(() => Seller, { mappedBy: "payouts" }),
})
