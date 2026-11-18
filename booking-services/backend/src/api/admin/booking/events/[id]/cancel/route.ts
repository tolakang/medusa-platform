import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { cancelPackageWorkflow } from "../../../../../../workflows/cancel-package"

// POST /admin/booking/events/:id/cancel (TASKS P3-30): cancel every piece of
// the event package; the policy decides the refund of its price.
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { result } = await cancelPackageWorkflow(req.scope).run({
    input: { package_id: req.params.id, created_by: req.auth_context.actor_id },
  })
  res.json(result)
}
