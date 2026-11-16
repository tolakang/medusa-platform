import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MathBN } from "@medusajs/framework/utils"
import { assertPartner } from "../own"

// GET /providers/me/earnings (TASKS P3-33): a partner's commissions (newest
// first, with the booking's time) and payouts, and what is earned but not in
// a payout yet. Partners only: staff never see money.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const providerId = req.auth_context.actor_id
  await assertPartner(req.scope, providerId)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: commissions } = await query.graph({
    entity: "booking_commission",
    fields: ["id", "booking_id", "line_total", "rate", "amount", "payout_amount", "currency_code", "status", "refund_review", "created_at"],
    filters: { provider_id: providerId },
    pagination: { order: { created_at: "DESC" }, take: 200 },
  })
  const { data: bookings } = commissions.length
    ? await query.graph({
        entity: "booking",
        fields: ["id", "starts_at", "resource.timezone", "order.display_id"],
        filters: { id: commissions.map((c) => c.booking_id) },
      })
    : { data: [] }
  const bookingById = new Map(bookings.map((b) => [b.id, b]))
  const { data: payouts } = await query.graph({
    entity: "booking_payout",
    fields: ["id", "amount", "currency_code", "period", "status", "paid_at", "reference"],
    filters: { provider_id: providerId },
    pagination: { order: { period: "DESC" } },
  })
  const owed = new Map<string, number>()
  for (const c of commissions.filter((c) => c.status === "pending")) {
    owed.set(c.currency_code, MathBN.convert(MathBN.add(owed.get(c.currency_code) ?? 0, c.payout_amount), 2).toNumber())
  }
  res.json({
    commissions: commissions.map((c) => {
      const b = bookingById.get(c.booking_id)
      return {
        ...c,
        booking: b ? { starts_at: b.starts_at, timezone: b.resource?.timezone, order_display_id: b.order?.display_id ?? null } : null,
      }
    }),
    payouts,
    not_yet_paid_out: [...owed].map(([currency_code, amount]) => ({ currency_code, amount })),
  })
}
