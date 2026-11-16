import { model } from "@medusajs/framework/utils"
import { BookingResource } from "./booking-resource"

// A day a resource takes no bookings (TASKS P3-32, plan §9.3 "hours and days
// off"): a calendar date local to the resource's time zone. Bookings already
// made for that day stay; no new time is offered or accepted.
export const BookingDayOff = model
  .define("booking_day_off", {
    id: model.id({ prefix: "bdoff" }).primaryKey(),
    // "YYYY-MM-DD" in the resource's time zone.
    date: model.text(),
    resource: model.belongsTo(() => BookingResource, { mappedBy: "days_off" }),
  })
  .indexes([{ on: ["resource_id", "date"], unique: true }])
  .checks([
    {
      name: "booking_day_off_date_format",
      expression: (columns) => `${columns.date} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'`,
    },
  ])
