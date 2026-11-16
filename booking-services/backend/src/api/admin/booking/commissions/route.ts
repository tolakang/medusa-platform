import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// GET /admin/booking/commissions[?refund_review=to_review] (TASKS P3-33):
// partner commissions, newest first, with the partner and booking time.
export const COMMISSION_FIELDS = [
  "id",
  "booking_id",
  "order_id",
  "line_total",
  "base",
  "rate",
  "amount",
  "payout_amount",
  "refunded_amount",
  "currency_code",
  "status",
  "refund_review",
  "payout_id",
  "created_at",
  "provider.id",
  "provider.name",
]

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const review = req.query.refund_review
  const { data } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "booking_commission",
    fields: COMMISSION_FIELDS,
    filters: review === "to_review" ? { refund_review: "to_review" } : {},
    pagination: { order: { created_at: "DESC" }, take: 200 },
  })
  res.json({ commissions: data })
}
