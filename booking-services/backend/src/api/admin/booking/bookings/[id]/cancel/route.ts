import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { cancelBookingWorkflow } from "../../../../../../workflows/cancel-booking"

// POST /admin/booking/bookings/:id/cancel (TASKS P3-11): staff cancel any
// booking; a staff cancel always refunds in full (cancel-booking, P3-08).
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { result } = await cancelBookingWorkflow(req.scope).run({
    input: { booking_id: req.params.id, created_by: req.auth_context.actor_id },
  })
  // The order's currency, so the admin can show "$8.00 refunded".
  const {
    data: [b],
  } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "booking",
    fields: ["id", "order.currency_code"],
    filters: { id: req.params.id },
  })
  res.json({
    booking: { id: result.booking.id, status: result.booking.status },
    refund: result.refund,
    refunded_amount: result.refunded_amount,
    currency_code: b?.order?.currency_code ?? null,
  })
}
