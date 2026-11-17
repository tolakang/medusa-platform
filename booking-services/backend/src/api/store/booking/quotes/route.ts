import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { listQuotes } from "../../../booking-quotes"
import { requestBookingQuoteWorkflow } from "../../../../workflows/booking-quotes"
import type { PostQuoteRequestType } from "../validators"

// GET /store/booking/quotes: the signed-in customer's quotes (TASKS P3-27).
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.json({ quotes: await listQuotes(req.scope, { customer_id: req.auth_context.actor_id }) })
}

// POST /store/booking/quotes { variant_id, details, wished_starts_at,
// address?, dropoff_address? }: ask for a quote on a quote-only service.
export const POST = async (req: AuthenticatedMedusaRequest<PostQuoteRequestType>, res: MedusaResponse) => {
  const { result } = await requestBookingQuoteWorkflow(req.scope).run({
    input: { ...req.validatedBody, customer_id: req.auth_context.actor_id },
  })
  res.json({ quote: { id: result.id, status: result.status } })
}
