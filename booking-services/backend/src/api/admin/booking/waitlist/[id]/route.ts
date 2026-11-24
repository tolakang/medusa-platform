import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { BOOKING_MODULE } from "../../../../../modules/booking"
import type BookingModuleService from "../../../../../modules/booking/service"

// DELETE /admin/booking/waitlist/:id (gap review 2026-11-24): take someone
// off the waitlist (as their own "leave": the entry is cancelled, not erased).
export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
  const service = req.scope.resolve<BookingModuleService>(BOOKING_MODULE)
  await service.retrieveBookingWaitlist(req.params.id)
  await service.updateBookingWaitlists({ id: req.params.id, status: "cancelled" })
  res.json({ id: req.params.id, status: "cancelled" })
}
