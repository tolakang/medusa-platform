import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { BOOKING_MODULE } from "../../../../../modules/booking"
import type BookingModuleService from "../../../../../modules/booking/service"
import { deleteTripZonePriceWorkflow } from "../../../../../workflows/trip-zones"
import type { PostAdminZonePriceUpdateType } from "../../validators"

// POST /admin/booking/zone-prices/:id (gap review 2026-11-24): change a
// price or its travel time.
export const POST = async (req: MedusaRequest<PostAdminZonePriceUpdateType>, res: MedusaResponse) => {
  const service = req.scope.resolve<BookingModuleService>(BOOKING_MODULE)
  await service.retrieveBookingZonePrice(req.params.id)
  const price = await service.updateBookingZonePrices({ id: req.params.id, ...req.validatedBody })
  res.json({ zone_price: price })
}

// DELETE /admin/booking/zone-prices/:id (TASKS P3-21).
export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
  await deleteTripZonePriceWorkflow(req.scope).run({ input: { id: req.params.id } })
  res.json({ id: req.params.id, deleted: true })
}
