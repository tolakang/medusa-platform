import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { markProviderPayoutPaidWorkflow } from "../../../../../../workflows/provider-commission"
import type { PostAdminPayoutPayType } from "../../../validators"

// POST /admin/booking/payouts/:id/pay (TASKS P3-33): the admin paid the
// partner outside Medusa; the transfer's reference is kept.
export const POST = async (req: MedusaRequest<PostAdminPayoutPayType>, res: MedusaResponse) => {
  await markProviderPayoutPaidWorkflow(req.scope).run({
    input: { id: req.params.id, reference: req.validatedBody.reference },
  })
  res.json({ id: req.params.id, status: "paid" })
}
