import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { generateResetPasswordTokenWorkflow } from "@medusajs/medusa/core-flows"
import { providerPortalLink } from "../../../../../../lib/provider-email"

// POST /admin/booking/providers/:id/reset-link (staging review, 2026-11-23):
// staff or a partner who can't sign in get a one-time link to set a new
// password, for the admin to copy and send them (chat, SMS) when the email
// doesn't reach them. Medusa's own reset token (15 minutes); the usual reset
// email goes out too.
export const NOT_SIGNED_UP_MESSAGE = "This person hasn't set a password yet: give them the invite code instead."

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const {
    data: [provider],
  } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph(
    { entity: "booking_provider", fields: ["id", "email", "status"], filters: { id: req.params.id } },
    { throwIfKeyNotFound: true }
  )
  if (provider.status === "invited") {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, NOT_SIGNED_UP_MESSAGE)
  }
  const config = req.scope.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
  const { result: token } = await generateResetPasswordTokenWorkflow(req.scope).run({
    input: {
      entityId: provider.email.toLowerCase(),
      actorType: "provider",
      provider: "emailpass",
      secret: config.projectConfig.http.jwtSecret!,
    },
  })
  const link = providerPortalLink("reset-password", { token, email: provider.email.toLowerCase() })
  if (!link) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Set PROVIDER_PORTAL_URL (or PROVIDER_CORS) so the link can point to the portal.")
  }
  res.json({ link, expires_in_minutes: 15 })
}
