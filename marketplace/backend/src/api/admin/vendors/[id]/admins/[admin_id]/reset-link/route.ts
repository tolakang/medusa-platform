import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { adminResetLink } from "@medusa-platform/medusa-core/lib/reset-link"
import { vendorPortalLink } from "../../../../../../../lib/vendor-email"

// POST /admin/vendors/:id/admins/:admin_id/reset-link (design critique,
// 2026-11-23): a one-time link for one of the vendor's sign-ins to set a new
// password, for the admin to send by chat when the email doesn't reach them.
export const POST = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const {
    data: [vendor],
  } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph(
    { entity: "vendor", fields: ["id", "admins.id", "admins.email"], filters: { id: req.params.id } },
    { throwIfKeyNotFound: true }
  )
  const admin = (vendor.admins ?? []).find((a) => a?.id === req.params.admin_id)
  if (!admin) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "This sign-in doesn't belong to the vendor.")
  }
  res.json(
    await adminResetLink(req.scope, {
      email: admin.email,
      actorType: "vendor",
      link: (params) => vendorPortalLink("reset-password", params),
      missing: "Set VENDOR_PORTAL_URL (or VENDOR_CORS) so the link can point to the vendor portal.",
    })
  )
}
