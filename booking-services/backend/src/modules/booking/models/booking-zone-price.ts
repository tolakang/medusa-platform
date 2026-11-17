import { model } from "@medusajs/framework/utils"
import { BookingZone } from "./booking-zone"

// What one trip between two zones costs with one vehicle size (a service
// variant), and how long it takes (TASKS P3-21, plan D12 "zones"). A price
// counts both ways: Town → Airport is also Airport → Town. The variant id is
// plain text (no keys into core tables).
export const BookingZonePrice = model
  .define("booking_zone_price", {
    id: model.id({ prefix: "bzpr" }).primaryKey(),
    variant_id: model.text(),
    // In the currency's main unit, as Medusa prices (e.g. 12.5 = $12.50).
    amount: model.bigNumber(),
    currency_code: model.text(),
    // How long the vehicle is booked for this trip.
    minutes: model.number(),
    from_zone: model.belongsTo(() => BookingZone, { mappedBy: "prices_from" }),
    to_zone: model.belongsTo(() => BookingZone, { mappedBy: "prices_to" }),
  })
  .indexes([{ on: ["variant_id", "from_zone_id", "to_zone_id"], unique: true }])
  .checks([
    { name: "booking_zone_price_amount_not_negative", expression: (c) => `${c.amount} >= 0` },
    { name: "booking_zone_price_minutes_range", expression: (c) => `${c.minutes} >= 5 AND ${c.minutes} <= 1440` },
  ])
