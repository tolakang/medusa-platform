import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { SELLER_MODULE } from "../../../../../../modules/seller"
import SellerModuleService from "../../../../../../modules/seller/service"
import { sellerPayoutBatchWorkflow } from "../../../../../../workflows/seller/payout"

// POST /admin/sellers/:id/payouts/approve (owner, 2026-11-25): approve this
// seller's pending commissions now instead of waiting for the payout day, held
// or not. Same workflow and locks as the payout day.
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const [seller] = await req.scope
    .resolve<SellerModuleService>(SELLER_MODULE)
    .listSellers({ id: req.params.id })
  if (!seller) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Seller not found")
  }
  const { result } = await sellerPayoutBatchWorkflow(req.scope).run({
    input: { cutoff: new Date(), seller_id: seller.id },
  })
  res.json({ seller_id: seller.id, ...result })
}
