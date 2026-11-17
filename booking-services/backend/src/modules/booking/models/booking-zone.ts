import { model } from "@medusajs/framework/utils"
import { BookingZonePrice } from "./booking-zone-price"

// An area trips start or end in, for zone pricing (kind C, TASKS P3-21, plan
// D12): e.g. "Siem Reap town", "Airport". The shop names its own.
export const BookingZone = model
  .define("booking_zone", {
    id: model.id({ prefix: "bzone" }).primaryKey(),
    name: model.text(),
    // Order in lists (admin and the shop's pickers).
    rank: model.number().default(0),
    prices_from: model.hasMany(() => BookingZonePrice, { mappedBy: "from_zone" }),
    prices_to: model.hasMany(() => BookingZonePrice, { mappedBy: "to_zone" }),
  })
  .indexes([{ on: ["name"], unique: true }])
