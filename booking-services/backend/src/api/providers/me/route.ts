import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { updateBookingProviderWorkflow } from "../../../workflows/booking-provider"
import { providerResponse } from "../../provider-auth"
import type { PostProviderMeType } from "../validators"

// GET /providers/me (TASKS P3-31): the signed-in provider and their resources.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.json(await providerResponse(req.scope, req.auth_context.actor_id))
}

// POST /providers/me: a provider edits their own profile.
export const POST = async (req: AuthenticatedMedusaRequest<PostProviderMeType>, res: MedusaResponse) => {
  await updateBookingProviderWorkflow(req.scope).run({
    input: { id: req.auth_context.actor_id, ...req.validatedBody },
  })
  res.json(await providerResponse(req.scope, req.auth_context.actor_id))
}
