import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { setBookingReviewStatusWorkflow } from "../../../../../workflows/booking-reviews"
import type { PostAdminReviewType } from "../../validators"

// POST /admin/booking/reviews/:id { status: "published" | "hidden" } (TASKS
// P3-29): hide a review from the shop, or show it again.
export const POST = async (req: MedusaRequest<PostAdminReviewType>, res: MedusaResponse) => {
  const { result } = await setBookingReviewStatusWorkflow(req.scope).run({ input: { id: req.params.id, ...req.validatedBody } })
  res.json({ review: { id: result.id, status: result.status } })
}
