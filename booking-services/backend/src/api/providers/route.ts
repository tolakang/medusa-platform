import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { createBookingPartnerWorkflow } from "../../workflows/booking-provider"
import { providerResponse } from "../provider-auth"
import type { PostProviderCreateType } from "./validators"

// POST /providers (TASKS P3-31): partner sign-up, called with the registration
// token from POST /auth/provider/emailpass/register. The partner waits for the
// admin's approval (status pending), after confirming their email.
export const POST = async (req: AuthenticatedMedusaRequest<PostProviderCreateType>, res: MedusaResponse) => {
  if (req.auth_context.actor_id) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "This account already belongs to a provider.")
  }
  const { result } = await createBookingPartnerWorkflow(req.scope).run({
    input: { ...req.validatedBody, auth_identity_id: req.auth_context.auth_identity_id },
  })
  res.status(201).json(await providerResponse(req.scope, result.id))
}
