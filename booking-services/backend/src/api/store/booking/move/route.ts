import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { moveBookingWorkflow } from "../../../../workflows/move-booking"
import type { PostBookingMoveType } from "../validators"

// POST /store/booking/move { booking_id, resource_id, starts_at, ends_at }
// (TASKS P3-28): a signed-in customer moves their booking to a free slot
// from /store/booking/slots. Another customer's booking answers 404.
export const POST = async (req: AuthenticatedMedusaRequest<PostBookingMoveType>, res: MedusaResponse) => {
  const { result } = await moveBookingWorkflow(req.scope).run({
    input: { ...req.validatedBody, by: "customer", customer_id: req.auth_context.actor_id },
  })
  res.json({ booking: { id: result.id, status: result.status, starts_at: result.starts_at, ends_at: result.ends_at } })
}
