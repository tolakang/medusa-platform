import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { rentalSpan, rentalUnit, rentalUnits } from "../../../../lib/rental-pricing"
import { BOOKING_MODULE } from "../../../../modules/booking"
import type BookingModuleService from "../../../../modules/booking/service"
import { zonedTimeToUtc } from "../../../../modules/booking/utils/slot"

export const RENTAL_DATES_QUERY_MESSAGE = "Give variant_id, start_date and end_date (YYYY-MM-DD)."

// GET /store/booking/rentals?variant_id=&start_date=&end_date= (TASKS P3-22):
// for a rental, how many days or nights the dates make and, for each item of
// that variant (a resource booked by whole days), how many are free over the
// whole range. The cart checks again when it holds one.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { variant_id, start_date, end_date } = req.query as Record<string, string | undefined>
  if (!variant_id || !start_date || !end_date) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, RENTAL_DATES_QUERY_MESSAGE)
  }
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [variant],
  } = await query.graph({
    entity: "product_variant",
    fields: ["id", "product.metadata", "booking_resources.id", "booking_resources.name", "booking_resources.timezone"],
    filters: { id: variant_id },
  })
  const unit = rentalUnit(variant?.product)
  if (!variant || !unit) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Rental ${variant_id} was not found.`)
  }
  const units = rentalUnits(unit, start_date, end_date)
  if (units === null) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "Choose the start and end dates (up to 60 days).")
  }
  const booking = req.scope.resolve<BookingModuleService>(BOOKING_MODULE)
  const span = rentalSpan(unit, start_date, end_date)
  const resources = ((variant as unknown as { booking_resources?: { id: string; name: string; timezone: string }[] })
    .booking_resources ?? []).filter(Boolean)
  const items = await Promise.all(
    resources.map(async (r) => {
      const check = await booking.checkSlot({
        resource_id: r.id,
        starts_at: zonedTimeToUtc(span.from, "00:00", r.timezone),
        ends_at: zonedTimeToUtc(span.to, "00:00", r.timezone),
      })
      return { resource_id: r.id, resource_name: r.name, remaining: check.available ? check.remaining : 0 }
    })
  )
  res.json({ unit, units, items })
}
