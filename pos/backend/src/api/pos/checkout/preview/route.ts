import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { posCheckoutPreviewWorkflow } from "../../../../workflows/pos-checkout"
import type { PostPosCheckoutPreviewType } from "../../validators"

// POST /pos/checkout/preview (owner, 2026-11-25): the sale's real total
// (prices, promotions, tax) before payment, priced as POST /pos/checkout
// prices it. Records nothing.
export const POST = async (req: AuthenticatedMedusaRequest<PostPosCheckoutPreviewType>, res: MedusaResponse) => {
  const { result } = await posCheckoutPreviewWorkflow(req.scope).run({
    input: { ...req.validatedBody, cashier_id: req.auth_context.actor_id },
  })
  res.json({ preview: result })
}
