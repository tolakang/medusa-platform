import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { SELLER_MODULE } from "../../../../../modules/seller"
import SellerModuleService from "../../../../../modules/seller/service"
import { markSellerPayoutPaidWorkflow } from "../../../../../workflows/seller/payout"
import type { PostAdminSellerPayoutType } from "../../validators"

const findSeller = async (req: AuthenticatedMedusaRequest) => {
  const [seller] = await req.scope
    .resolve<SellerModuleService>(SELLER_MODULE)
    .listSellers({ id: req.params.id })
  if (!seller) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Seller not found")
  }
  return seller
}

// GET /admin/sellers/:id/payouts: the seller's payout history (newest first)
// and the adjustments (clawbacks) still open, carried into the next payout.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const seller = await findSeller(req)
  const sellers = req.scope.resolve<SellerModuleService>(SELLER_MODULE)
  const [payouts, adjustments] = await Promise.all([
    sellers.listSellerPayouts({ seller_id: seller.id }, { order: { paid_at: "DESC" }, take: 50 }),
    sellers.listSellerAdjustments({ seller_id: seller.id }, { order: { created_at: "DESC" }, take: 50 }),
  ])
  res.json({ payouts, adjustments })
}

// POST /admin/sellers/:id/payouts (TASKS P5-05): the shop paid this seller
// (outside Medusa); their approved commissions become paid, open clawbacks are
// settled, and a payout with the bank/ABA reference is recorded per currency.
// Nothing approved = nothing changes.
export const POST = async (
  req: AuthenticatedMedusaRequest<PostAdminSellerPayoutType>,
  res: MedusaResponse
) => {
  const seller = await findSeller(req)
  const { result } = await markSellerPayoutPaidWorkflow(req.scope).run({
    input: {
      seller_id: seller.id,
      currency_code: req.validatedBody.currency_code,
      reference: req.validatedBody.reference ?? null,
      paid_at: new Date(),
    },
  })
  res.json({ seller_id: seller.id, ...result })
}
