import { model } from "@medusajs/framework/utils"

// A pass a customer bought (TASKS P3-29): credits for the services it covers,
// until it runs out. Issued when the order with the pass product is placed
// (one per order line; `line_item_id` keeps that once). `product_ids` are the
// services it covers, fixed when it's issued.
export const BookingPass = model
  .define("booking_pass", {
    id: model.id({ prefix: "bpass" }).primaryKey(),
    customer_id: model.text(),
    order_id: model.text(),
    line_item_id: model.text(),
    product_id: model.text(),
    title: model.text(),
    credits_total: model.number(),
    credits_left: model.number(),
    expires_at: model.dateTime(),
    product_ids: model.json(),
  })
  .indexes([
    { name: "IDX_booking_pass_line_item", on: ["line_item_id"], unique: true, where: "deleted_at IS NULL" },
    { name: "IDX_booking_pass_customer", on: ["customer_id"] },
  ])
  .checks([{ name: "booking_pass_credits_check", expression: (c) => `${c.credits_left} >= 0 AND ${c.credits_left} <= ${c.credits_total}` }])
