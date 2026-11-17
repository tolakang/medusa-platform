import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { declineBookingQuoteWorkflow } from "../../../../../../workflows/booking-quotes"

// POST /store/booking/quotes/:id/decline (TASKS P3-27): the customer says no.
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  await declineBookingQuoteWorkflow(req.scope).run({ input: { id: req.params.id, customer_id: req.auth_context.actor_id } })
  res.json({ quote: { id: req.params.id, status: "declined" } })
}
