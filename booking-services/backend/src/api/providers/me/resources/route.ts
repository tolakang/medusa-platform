import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ownResources } from "../own"

// GET /providers/me/resources (TASKS P3-32): the provider's calendars with
// their weekly hours and days off.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.json({ resources: await ownResources(req.scope, req.auth_context.actor_id) })
}
