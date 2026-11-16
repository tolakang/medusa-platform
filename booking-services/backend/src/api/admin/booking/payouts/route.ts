import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// GET /admin/booking/payouts (TASKS P3-33): monthly partner payouts, newest
// first: the report the admin pays from.
export const PAYOUT_FIELDS = [
  "id",
  "amount",
  "currency_code",
  "period",
  "status",
  "paid_at",
  "reference",
  "created_at",
  "provider.id",
  "provider.name",
  "provider.email",
  "provider.phone",
]

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { data } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "booking_payout",
    fields: PAYOUT_FIELDS,
    pagination: { order: { created_at: "DESC" }, take: 200 },
  })
  res.json({ payouts: data })
}
