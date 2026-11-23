import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { changeBookingLengthWorkflow } from "../../../../../../workflows/change-booking-length"
import type { PostAdminBookingChangeType } from "../../../validators"

// POST /admin/booking/bookings/:id/change { start_date, end_date } for a
// rental, or { hours } for a trip by the hour (owner, 2026-11-23): the new
// length at its price; the difference refunded, or the extra due at the venue.
export const POST = async (req: AuthenticatedMedusaRequest<PostAdminBookingChangeType>, res: MedusaResponse) => {
  const { result } = await changeBookingLengthWorkflow(req.scope).run({
    input: { ...req.validatedBody, booking_id: req.params.id, created_by: req.auth_context.actor_id },
  })
  res.json(result)
}
