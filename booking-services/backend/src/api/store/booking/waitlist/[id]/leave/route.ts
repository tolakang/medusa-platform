import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { leaveWaitlistWorkflow } from "../../../../../../workflows/booking-waitlist"

// POST /store/booking/waitlist/:id/leave (TASKS P3-29).
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  await leaveWaitlistWorkflow(req.scope).run({ input: { id: req.params.id, customer_id: req.auth_context.actor_id } })
  res.json({ waitlist: { id: req.params.id, status: "cancelled" } })
}
