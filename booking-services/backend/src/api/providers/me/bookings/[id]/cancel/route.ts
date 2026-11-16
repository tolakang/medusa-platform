import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { cancelBookingWorkflow } from "../../../../../../workflows/cancel-booking"
import { isPartner, ownResourceIds } from "../../../own"

// POST /providers/me/bookings/:id/cancel (TASKS P3-32): a provider cancels a
// booking on one of their own calendars; the shop's policy decides the refund
// (cancel-booking, P3-08). Staff don't see money, so only a partner gets the
// refunded amount.
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const providerId = req.auth_context.actor_id
  const {
    data: [booking],
  } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "booking",
    fields: ["id", "resource_id"],
    filters: { id: req.params.id },
  })
  if (!booking || !(await ownResourceIds(req.scope, providerId)).includes(booking.resource_id)) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Booking ${req.params.id} was not found.`)
  }
  const { result } = await cancelBookingWorkflow(req.scope).run({
    input: { booking_id: booking.id, created_by: providerId },
  })
  res.json({
    booking: { id: result.booking.id, status: result.booking.status },
    refund: result.refund,
    ...((await isPartner(req.scope, providerId)) ? { refunded_amount: result.refunded_amount } : {}),
  })
}
