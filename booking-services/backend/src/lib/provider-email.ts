import { portalLink } from "@medusa-platform/medusa-core/lib/email-verified"

// Providers confirm their sign-in email (http.authVerificationsPerActor,
// TASKS P3-31). The provider portal (P3-32) asks for verification with this
// metadata, so the core's verification subscriber sends its link to the
// portal instead of the storefront (src/subscribers/auth-email-verification.ts).
export const PROVIDER_ACTOR_METADATA = { actor: "provider" }

export const PROVIDER_EMAIL_NOT_VERIFIED_MESSAGE =
  "This partner hasn't confirmed their email yet, so they can't be approved. They get the link when they sign in to the provider portal."

// PROVIDER_PORTAL_URL, or the first PROVIDER_CORS origin.
export function providerPortalLink(
  page: "verify-account" | "reset-password",
  params: Record<string, string>,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  return portalLink(page, params, env.PROVIDER_PORTAL_URL, env.PROVIDER_CORS)
}
