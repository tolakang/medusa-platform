import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { cancelVendorPayoutWorkflow } from "../../../../../workflows/marketplace/create-payouts"
import { PAYOUT_FIELDS } from "../../route"

// POST /admin/vendor-payouts/:id/cancel (gap review 2026-11-24): cancel a
// pending payout made by mistake; its commissions wait for the next one.
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  await query.graph(
    { entity: "vendor_payout", fields: ["id"], filters: { id: req.params.id } },
    { throwIfKeyNotFound: true }
  )
  await cancelVendorPayoutWorkflow(req.scope).run({ input: { id: req.params.id } })
  const {
    data: [payout],
  } = await query.graph({ entity: "vendor_payout", fields: PAYOUT_FIELDS, filters: { id: req.params.id } })
  res.json({ vendor_payout: payout })
}
