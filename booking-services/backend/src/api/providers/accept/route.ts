import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { acceptBookingStaffInviteWorkflow } from "../../../workflows/booking-provider"
import { providerResponse } from "../../provider-auth"
import type { PostProviderAcceptType } from "../validators"

// POST /providers/accept (TASKS P3-31), called with the registration token
// from POST /auth/provider/emailpass/register: links that sign-in to the staff
// invitation with the same email, if the body carries its invite code. Then
// the staff member confirms the email and signs in at
// POST /auth/provider/emailpass.
export const POST = async (req: AuthenticatedMedusaRequest<PostProviderAcceptType>, res: MedusaResponse) => {
  if (req.auth_context.actor_id) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "This account already belongs to a provider.")
  }
  const { result } = await acceptBookingStaffInviteWorkflow(req.scope).run({
    input: {
      auth_identity_id: req.auth_context.auth_identity_id,
      invite_code: req.validatedBody.invite_code,
    },
  })
  res.json(await providerResponse(req.scope, result.id))
}
