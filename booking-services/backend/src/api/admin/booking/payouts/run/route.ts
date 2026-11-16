import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { payoutCutoff, payoutPeriod } from "../../../../../lib/provider-commission"
import { createProviderPayoutsWorkflow } from "../../../../../workflows/provider-commission"

// POST /admin/booking/payouts/run (TASKS P3-33): the payout job's run, now:
// last month's payouts. Safe to repeat (one payout per partner, month and
// currency).
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const now = new Date()
  const { result } = await createProviderPayoutsWorkflow(req.scope).run({
    input: { cutoff: payoutCutoff(now), period: payoutPeriod(now) },
  })
  res.json({ period: payoutPeriod(now), created: result.length })
}
