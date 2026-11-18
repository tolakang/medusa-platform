import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { cancelBookingWorkflow } from "../../../../../../workflows/cancel-booking"

// POST /store/booking/series/:id/cancel (TASKS P3-29 follow-up): a signed-in
// customer cancels the rest of their weekly series: every week not started
// yet, each through the cancellation policy (refunded when early enough).
// Another customer's series answers 404.
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { data } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "booking",
    fields: ["id", "customer_id", "status", "starts_at"],
    filters: { series_id: req.params.id, status: ["pending", "confirmed"] },
  })
  const mine = data.filter((b) => b.customer_id === req.auth_context.actor_id)
  if (!mine.length) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "This series was not found.")
  }
  const now = Date.now()
  const rest = mine.filter((b) => new Date(b.starts_at).getTime() > now).sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
  const results: { booking_id: string; refund: string; refunded_amount: number }[] = []
  for (const b of rest) {
    const { result } = await cancelBookingWorkflow(req.scope).run({
      input: { booking_id: b.id, customer_id: req.auth_context.actor_id, created_by: req.auth_context.actor_id },
    })
    results.push({ booking_id: b.id, refund: result.refund, refunded_amount: result.refunded_amount })
  }
  res.json({
    cancelled: results.length,
    refunded_amount: results.reduce((s, r) => s + r.refunded_amount, 0),
    bookings: results,
  })
}
