import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MathBN } from "@medusajs/framework/utils"
import { roundToCurrency } from "../../../../lib/vendor-commission"

// GET /vendors/me/payouts (TASKS P6-06; the vendor portal shows it in P6-09):
// the signed-in vendor's payouts, newest first, and what it has earned that
// isn't in a payout yet, per currency.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [admin],
  } = await query.graph({
    entity: "vendor_admin",
    fields: ["vendor.id"],
    filters: { id: req.auth_context.actor_id },
  })
  const vendorId = admin.vendor!.id
  const { data: payouts } = await query.graph({
    entity: "vendor_payout",
    fields: ["id", "amount", "currency_code", "period", "status", "paid_at", "reference"],
    filters: { vendor_id: vendorId },
    pagination: { order: { created_at: "DESC" } },
  })
  const { data: pending } = await query.graph({
    entity: "vendor_commission",
    fields: ["payout_amount", "currency_code"],
    filters: { vendor_id: vendorId, status: "pending" },
  })
  // Summed exactly, rounded once per currency.
  const sums = new Map<string, ReturnType<typeof MathBN.convert>>()
  const upcoming = new Map<string, number>()
  for (const c of pending) {
    const sum = MathBN.add(sums.get(c.currency_code) ?? 0, c.payout_amount)
    sums.set(c.currency_code, sum)
    upcoming.set(c.currency_code, roundToCurrency(sum, c.currency_code))
  }
  res.json({
    vendor_payouts: payouts,
    not_yet_paid_out: [...upcoming.entries()].map(([currency_code, amount]) => ({
      currency_code,
      amount,
    })),
  })
}
