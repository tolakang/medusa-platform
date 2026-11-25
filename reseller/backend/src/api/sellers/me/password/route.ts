import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { changePasswordWorkflow } from "@medusa-platform/medusa-core/workflows/change-password"
import type { PostCustomerPasswordType } from "@medusa-platform/medusa-core/api/store/customers/me/password/validators"
import { sellerPortalLink } from "../../../../lib/seller-portal"

// POST /sellers/me/password { current_password, new_password }: the signed-in
// seller changes their password with the shared core's change-password
// workflow (body validated in middlewares.ts). The confirmation email's
// "not you?" link opens the seller portal's /forgot-password page
// (SELLER_PORTAL_URL, or the first SELLER_CORS origin), like the invite and
// reset emails; without either it keeps the core's storefront link.
export const POST = async (
  req: AuthenticatedMedusaRequest<PostCustomerPasswordType>,
  res: MedusaResponse
) => {
  const portal = sellerPortalLink("forgot-password", {})
  await changePasswordWorkflow(req.scope).run({
    input: {
      auth_identity_id: req.auth_context.auth_identity_id,
      current_password: req.validatedBody.current_password,
      new_password: req.validatedBody.new_password,
      forgot_url: portal ? portal.replace(/\?$/, "") : undefined,
    },
  })
  res.json({ success: true })
}
