import type { AuthenticatedMedusaRequest, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { ratingSummary } from "../../../../lib/reviews"
import { writeBookingReviewWorkflow } from "../../../../workflows/booking-reviews"
import type { PostReviewType } from "../validators"

// GET /store/booking/reviews?product_id= (TASKS P3-29): a service's published
// reviews, newest first (at most 50), with the average and count.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const productId = typeof req.query.product_id === "string" ? req.query.product_id : ""
  if (!productId) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "product_id is required.")
  }
  const { data } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "booking_review",
    fields: ["id", "rating", "comment", "author", "reply", "replied_at", "created_at"],
    filters: { product_id: productId, status: "published" },
  })
  const sorted = [...data].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  res.json({ ...ratingSummary(data.map((r) => r.rating)), reviews: sorted.slice(0, 50) })
}

// POST /store/booking/reviews { booking_id, rating, comment? }: the signed-in
// customer reviews a booking they had (once).
export const POST = async (req: AuthenticatedMedusaRequest<PostReviewType>, res: MedusaResponse) => {
  const { result } = await writeBookingReviewWorkflow(req.scope).run({
    input: { ...req.validatedBody, customer_id: req.auth_context.actor_id },
  })
  res.json({ review: { id: result.id, rating: result.rating, comment: result.comment, author: result.author, status: result.status } })
}
