import { model } from "@medusajs/framework/utils"

// A customer waiting for a full day of a service (TASKS P3-29). The waitlist
// job emails them once when a time frees up that day (status `notified`);
// they book it like any time, first come first served. `date` is the local
// date in the service's calendars, as on the slot picker.
export const BookingWaitlist = model
  .define("booking_waitlist", {
    id: model.id({ prefix: "bwait" }).primaryKey(),
    customer_id: model.text(),
    variant_id: model.text(),
    date: model.text(),
    status: model.enum(["waiting", "notified", "cancelled"]).default("waiting"),
    notified_at: model.dateTime().nullable(),
  })
  .indexes([
    { name: "IDX_booking_waitlist_status_date", on: ["status", "date"] },
    { name: "IDX_booking_waitlist_customer", on: ["customer_id"] },
  ])
