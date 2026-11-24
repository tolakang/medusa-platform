import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { BOOKING_MODULE } from "../../../../../modules/booking"
import type BookingModuleService from "../../../../../modules/booking/service"
import { deleteTripZoneWorkflow } from "../../../../../workflows/trip-zones"
import type { PostAdminZoneUpdateType } from "../../validators"

// POST /admin/booking/zones/:id (gap review 2026-11-24): rename a zone or
// change its place in the list.
export const POST = async (req: MedusaRequest<PostAdminZoneUpdateType>, res: MedusaResponse) => {
  const service = req.scope.resolve<BookingModuleService>(BOOKING_MODULE)
  await service.retrieveBookingZone(req.params.id)
  const zone = await service.updateBookingZones({ id: req.params.id, ...req.validatedBody })
  res.json({ zone })
}

// DELETE /admin/booking/zones/:id (TASKS P3-21): the zone and its prices.
export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
  await deleteTripZoneWorkflow(req.scope).run({ input: { id: req.params.id } })
  res.json({ id: req.params.id, deleted: true })
}
