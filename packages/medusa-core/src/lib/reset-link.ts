import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { generateResetPasswordTokenWorkflow } from "@medusajs/medusa/core-flows"

// A one-time "set a new password" link that an admin copies and sends by chat
// or SMS, for a portal user (vendor, seller, cashier) who can't sign in and
// doesn't get the email (design critique, 2026-11-23; the same idea as
// Booking's provider reset link). Medusa's own reset token, valid for 15
// minutes. The usual reset email goes out too (auth.password_reset).
export const NOT_SIGNED_UP_MESSAGE =
  "This person hasn't set a password yet: give them the invite code instead."

export const RESET_LINK_MINUTES = 15

export async function adminResetLink(
  scope: MedusaContainer,
  input: {
    email: string
    actorType: string
    /** The portal's /reset-password page with these params, or null if the portal URL isn't set. */
    link: (params: Record<string, string>) => string | null
    /** What to set when `link` returns null. */
    missing: string
  }
): Promise<{ link: string; expires_in_minutes: number }> {
  const email = input.email.trim().toLowerCase()
  const identities = await scope
    .resolve(Modules.AUTH)
    .listProviderIdentities({ entity_id: email, provider: "emailpass" })
  if (!identities.length) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, NOT_SIGNED_UP_MESSAGE)
  }
  const config = scope.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
  const { result: token } = await generateResetPasswordTokenWorkflow(scope).run({
    input: {
      entityId: email,
      actorType: input.actorType,
      provider: "emailpass",
      secret: config.projectConfig.http.jwtSecret!,
    },
  })
  const link = input.link({ token, email })
  if (!link) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, input.missing)
  }
  return { link, expires_in_minutes: RESET_LINK_MINUTES }
}
