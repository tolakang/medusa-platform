import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { sendBookingQuoteWorkflow } from "../../../../../workflows/booking-quotes"
import type { PostAdminQuoteType } from "../../validators"

// POST /admin/booking/quotes/:id { amount, currency_code, resource_id,
// starts_at, duration_minutes, reply?, valid_days? } (TASKS P3-27): price
// the quote and email it to the customer.
export const POST = async (req: MedusaRequest<PostAdminQuoteType>, res: MedusaResponse) => {
  const { result } = await sendBookingQuoteWorkflow(req.scope).run({ input: { ...req.validatedBody, id: req.params.id } })
  res.json({ quote: { id: result.id, status: "quoted" }, emailed: !!result.email })
}
