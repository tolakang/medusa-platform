import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { settleProviderCommissionWorkflow } from "../../../../../../workflows/provider-commission"
import type { PostAdminCommissionSettleType } from "../../../validators"

// POST /admin/booking/commissions/:id/settle (TASKS P3-33): a commission held
// for a refund is kept (the next payout pays it) or cancelled.
export const POST = async (req: MedusaRequest<PostAdminCommissionSettleType>, res: MedusaResponse) => {
  await settleProviderCommissionWorkflow(req.scope).run({ input: { id: req.params.id, action: req.validatedBody.action } })
  res.json({ id: req.params.id, settled: req.validatedBody.action })
}
