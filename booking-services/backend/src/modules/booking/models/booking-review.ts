import { model } from "@medusajs/framework/utils"

// A customer's review of a booking they had (TASKS P3-29): 1-5 stars and an
// optional comment, one per booking. Published at once (only real customers
// can write one); staff can hide it. `product_id` shows it on the service's
// page; `author` is the name shown ("Sok C.").
export const BookingReview = model
  .define("booking_review", {
    id: model.id({ prefix: "brev" }).primaryKey(),
    booking_id: model.text(),
    customer_id: model.text(),
    product_id: model.text(),
    resource_id: model.text().nullable(),
    rating: model.number(),
    comment: model.text().nullable(),
    author: model.text().nullable(),
    status: model.enum(["published", "hidden"]).default("published"),
    // The shop's public answer (P3-29 follow-up).
    reply: model.text().nullable(),
    replied_at: model.dateTime().nullable(),
  })
  .indexes([
    { name: "IDX_booking_review_booking", on: ["booking_id"], unique: true, where: "deleted_at IS NULL" },
    { name: "IDX_booking_review_product_status", on: ["product_id", "status"] },
  ])
  .checks([{ name: "booking_review_rating_check", expression: (columns) => `${columns.rating} >= 1 AND ${columns.rating} <= 5` }])
