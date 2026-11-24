import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import type { PostAdminBookingMoveType } from "../../../../../admin/booking/validators"
import { moveBookingWorkflow } from "../../../../../../workflows/move-booking"
import { ownResourceIds } from "../../../own"

// POST /providers/me/bookings/:id/move { resource_id?, starts_at? } (gap
// review 2026-11-24): a provider moves a booking on their own calendars to
// another time or another of their own calendars; same length, as staff do.
export const POST = async (req: AuthenticatedMedusaRequest<PostAdminBookingMoveType>, res: MedusaResponse) => {
  const providerId = req.auth_context.actor_id
  const own = await ownResourceIds(req.scope, providerId)
  const {
    data: [booking],
  } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "booking",
    fields: ["id", "resource_id"],
    filters: { id: req.params.id },
  })
  if (!booking || !own.includes(booking.resource_id)) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Booking ${req.params.id} was not found.`)
  }
  if (req.validatedBody.resource_id && !own.includes(req.validatedBody.resource_id)) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "That calendar was not found.")
  }
  const { result } = await moveBookingWorkflow(req.scope).run({
    input: { ...req.validatedBody, booking_id: booking.id, by: "staff" },
  })
  res.json({ booking: { id: result.id, status: result.status, starts_at: result.starts_at, ends_at: result.ends_at } })
}
