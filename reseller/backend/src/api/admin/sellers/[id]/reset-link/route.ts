import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { adminResetLink } from "@medusa-platform/medusa-core/lib/reset-link"
import { sellerPortalLink } from "../../../../../lib/seller-portal"

// POST /admin/sellers/:id/reset-link (design critique, 2026-11-23): a
// one-time link for the seller to set a new password, for the admin to send
// by chat when the email doesn't reach them.
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const {
    data: [seller],
  } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph(
    { entity: "seller", fields: ["id", "email"], filters: { id: req.params.id } },
    { throwIfKeyNotFound: true }
  )
  res.json(
    await adminResetLink(req.scope, {
      email: seller.email,
      actorType: "seller",
      link: (params) => sellerPortalLink("reset-password", params),
      missing: "Set SELLER_PORTAL_URL (or SELLER_CORS) so the link can point to the seller portal.",
    })
  )
}
