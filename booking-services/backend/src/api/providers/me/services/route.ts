import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { createProviderServiceWorkflow } from "../../../../workflows/provider-service"
import type { PostProviderServiceType } from "../../validators"
import { assertPartner, ownServices } from "../own"

// GET /providers/me/services (TASKS P3-32): the provider's own services.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.json({ services: await ownServices(req.scope, req.auth_context.actor_id) })
}

// POST /providers/me/services: a partner adds a service with its lengths and
// prices; it is offered on their own calendars.
export const POST = async (req: AuthenticatedMedusaRequest<PostProviderServiceType>, res: MedusaResponse) => {
  const providerId = req.auth_context.actor_id
  await assertPartner(req.scope, providerId)
  const { result } = await createProviderServiceWorkflow(req.scope).run({
    input: { provider_id: providerId, ...req.validatedBody },
  })
  const [service] = await ownServices(req.scope, providerId, result.id)
  res.status(201).json({ service })
}
