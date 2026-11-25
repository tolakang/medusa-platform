import { model } from "@medusajs/framework/utils"
import { Seller } from "./seller"

// A change to what a seller is owed outside one commission: a clawback when an
// order whose commission was already paid out is refunded or cancelled (a
// negative amount). Open adjustments are carried into the seller's next payout
// and settled by it (payout_id). Own-module data; ids of core records are plain
// text.
export const SellerAdjustment = model.define("seller_adjustment", {
  id: model.id({ prefix: "sadj" }).primaryKey(),
  order_id: model.text().nullable(),
  commission_id: model.text().nullable(),
  // Negative = taken off the next payout.
  amount: model.bigNumber(),
  currency_code: model.text(),
  reason: model.text(),
  status: model.enum(["open", "settled"]).default("open"),
  payout_id: model.text().nullable(),
  seller: model.belongsTo(() => Seller, { mappedBy: "adjustments" }),
})
