import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { cancelPackageWorkflow } from "../../../../../../workflows/cancel-package"

// POST /store/booking/package/:id/cancel (TASKS P3-30): a signed-in customer
// cancels their whole event package (one piece alone can't be cancelled).
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { result } = await cancelPackageWorkflow(req.scope).run({
    input: { package_id: req.params.id, customer_id: req.auth_context.actor_id, created_by: req.auth_context.actor_id },
  })
  res.json(result)
}
