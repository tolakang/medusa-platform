import { model } from "@medusajs/framework/utils"
import { Booking } from "./booking"
import { BookingDayOff } from "./booking-day-off"
import { BookingProvider } from "./booking-provider"
import { BookingSchedule } from "./booking-schedule"

// Something that can be booked: a person, a room, a piece of equipment or a
// venue (BUILD_PLAN §9.3, TASKS P3-01). Which services (product variants) it
// offers is a module link (P3-02); no columns on core tables.
export const BookingResource = model
  .define("booking_resource", {
    id: model.id({ prefix: "bres" }).primaryKey(),
    name: model.text(),
    type: model.enum(["staff", "room", "equipment", "venue"]),
    // How many bookings may overlap at one time (1 for a person, more for a
    // class or a room with seats). Checked by isSlotAvailable (P3-03).
    capacity: model.number().default(1),
    // IANA time zone of the schedule, e.g. "Asia/Phnom_Penh". Weekly hours
    // are local to this zone; booking times are stored in UTC.
    timezone: model.text(),
    is_active: model.boolean().default(true),
    // Where the person, driver or keeper of this calendar gets their jobs on
    // Telegram (TASKS P3-28): their chat with the staff bot. Null = the staff
    // group gets the job, with the calendar's name.
    telegram_chat_id: model.text().nullable(),
    // Booked by whole days (a rental, kind E, TASKS P3-22): no weekly hours;
    // a booking runs from local midnight to local midnight, and capacity is
    // how many of the item the shop has.
    whole_days: model.boolean().default(false),
    // The provider who serves it (P3-31): a staff member's own calendar or a
    // partner's resource. Null = the shop's own (admin only).
    provider: model.belongsTo(() => BookingProvider, { mappedBy: "resources" }).nullable(),
    schedules: model.hasMany(() => BookingSchedule, {
      mappedBy: "resource",
    }),
    bookings: model.hasMany(() => Booking, {
      mappedBy: "resource",
    }),
    days_off: model.hasMany(() => BookingDayOff, {
      mappedBy: "resource",
    }),
  })
  // Weekly hours belong to the resource; bookings are kept as history.
  .cascades({ delete: ["schedules", "days_off"] })
  .checks([
    {
      name: "booking_resource_capacity_positive",
      expression: (columns) => `${columns.capacity} >= 1`,
    },
  ])
