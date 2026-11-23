import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { adminResetLink } from "@medusa-platform/medusa-core/lib/reset-link"
import { posAppLink } from "../../../../../../lib/pos-app"
import { POS_MODULE } from "../../../../../../modules/pos"
import type PosModuleService from "../../../../../../modules/pos/service"

// POST /admin/pos/cashiers/:id/reset-link (design critique, 2026-11-23): a
// one-time link for a cashier who forgot their password, for the admin to
// send by chat or open on the till, so selling isn't blocked by email.
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const pos: PosModuleService = req.scope.resolve(POS_MODULE)
  const cashier = await pos.retrievePosCashier(req.params.id)
  res.json(
    await adminResetLink(req.scope, {
      email: cashier.email,
      actorType: "cashier",
      link: (params) => posAppLink("reset-password", params),
      missing: "Set POS_APP_URL (or POS_CORS) so the link can point to the POS app.",
    })
  )
}
