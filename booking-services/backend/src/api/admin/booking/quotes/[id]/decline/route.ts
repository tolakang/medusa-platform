import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { declineBookingQuoteWorkflow } from "../../../../../../workflows/booking-quotes"

// POST /admin/booking/quotes/:id/decline (TASKS P3-27): staff can't do it.
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  await declineBookingQuoteWorkflow(req.scope).run({ input: { id: req.params.id } })
  res.json({ quote: { id: req.params.id, status: "declined" } })
}
