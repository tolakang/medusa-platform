import { model } from "@medusajs/framework/utils"

// One credit of a pass used by one booking (TASKS P3-29): taken when the
// order is placed, given back (`returned`) when the booking is cancelled
// within the cancellation policy. Unique per booking, so neither happens twice.
export const BookingPassUse = model
  .define("booking_pass_use", {
    id: model.id({ prefix: "bpuse" }).primaryKey(),
    pass_id: model.text(),
    booking_id: model.text(),
    status: model.enum(["used", "returned"]).default("used"),
    // Credits this booking took: its seats on a departure, its days or nights
    // of a rental, else 1 (P3-29 follow-up).
    credits: model.number().default(1),
  })
  .indexes([{ name: "IDX_booking_pass_use_booking", on: ["booking_id"], unique: true, where: "deleted_at IS NULL" }])
