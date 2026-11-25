import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { SELLER_MODULE } from "../../../../modules/seller"
import { nextPayoutDate } from "../../../../modules/seller/payout"
import SellerModuleService from "../../../../modules/seller/service"

// GET /sellers/me/payouts: the seller's payout history with the shop's
// references, their adjustments (clawbacks after a refund of an order already
// paid out; open ones come off the next payout) and the next payout date.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const sellers = req.scope.resolve<SellerModuleService>(SELLER_MODULE)
  const seller_id = req.auth_context.actor_id
  const [payouts, adjustments] = await Promise.all([
    sellers.listSellerPayouts({ seller_id }, { order: { paid_at: "DESC" }, take: 50 }),
    sellers.listSellerAdjustments({ seller_id }, { order: { created_at: "DESC" }, take: 50 }),
  ])
  res.json({
    payouts,
    adjustments,
    next_payout_date: nextPayoutDate(new Date()).toISOString(),
  })
}
