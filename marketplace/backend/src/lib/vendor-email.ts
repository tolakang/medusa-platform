import { portalLink } from "@medusa-platform/medusa-core/lib/email-verified"

export const VENDOR_EMAIL_NOT_VERIFIED_MESSAGE =
  "This vendor hasn't confirmed their email yet, so it can't be approved. They get the link when they sign in to the vendor portal."

// The vendor portal's verify page (review 2, A3), used through the hook of the
// core's verification subscriber (src/subscribers/auth-email-verification.ts).
// The vendor portal asks for verification with this metadata.
export const VENDOR_ACTOR_METADATA = { actor: "vendor" }

// VENDOR_PORTAL_URL, or the first VENDOR_CORS origin (the portal's origin, as
// for the admin).
export function vendorPortalLink(
  page: "verify-account",
  params: Record<string, string>,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  return portalLink(page, params, env.VENDOR_PORTAL_URL, env.VENDOR_CORS)
}
