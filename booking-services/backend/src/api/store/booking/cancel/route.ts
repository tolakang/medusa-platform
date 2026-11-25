import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { cancelBookingWorkflow, planCancellation } from "../../../../workflows/cancel-booking"
import { BOOKING_MODULE } from "../../../../modules/booking"
import type BookingModuleService from "../../../../modules/booking/service"
import type { GetBookingCancelPreviewType, PostBookingCancelType } from "../validators"

// POST /store/booking/cancel { booking_id } (TASKS P3-10): a signed-in
// customer cancels one of their bookings; the policy decides the refund
// (cancel-booking, P3-08). Another customer's booking answers 404.
export const POST = async (
  req: AuthenticatedMedusaRequest<PostBookingCancelType>,
  res: MedusaResponse
) => {
  const { result } = await cancelBookingWorkflow(req.scope).run({
    input: {
      booking_id: req.validatedBody.booking_id,
      customer_id: req.auth_context.actor_id,
      created_by: req.auth_context.actor_id,
    },
  })
  res.json({
    booking: { id: result.booking.id, status: result.booking.status },
    refund: result.refund,
    refunded_amount: result.refunded_amount,
    pass_returned: result.pass_returned,
  })
}

// GET /store/booking/cancel?booking_id= : what cancelling would do, before
// the customer confirms (refund or not, how much, pass credit back). It
// runs the same plan as the cancellation and changes nothing.
export const GET = async (
  req: AuthenticatedMedusaRequest<unknown, GetBookingCancelPreviewType>,
  res: MedusaResponse
) => {
  const input = {
    booking_id: req.validatedQuery.booking_id,
    customer_id: req.auth_context.actor_id,
  }
  const plan = await planCancellation(req.scope, input)
  const service = req.scope.resolve<BookingModuleService>(BOOKING_MODULE)
  const [use] = await service.listBookingPassUses({ booking_id: input.booking_id, status: "used" })
  res.json({
    refund: plan.outcome,
    refund_amount: plan.refund?.amount ?? 0,
    // A pass credit comes back within the policy (cancel-booking).
    pass_credit: !!use && (plan.outcome === "refunded" || plan.outcome === "not_captured"),
  })
}
