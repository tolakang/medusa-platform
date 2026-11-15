import type { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

export const VENDOR_EMAIL_NOT_VERIFIED_MESSAGE =
  "This vendor hasn't confirmed their email yet, so it can't be approved. They get the link when they sign in to the vendor portal."

/**
 * Whether the sign-in email (emailpass) has a confirmed verification. A
 * vendor admin's email is stored lowercase (create-vendor), while the sign-in
 * identity keeps the case it was registered with, so both match ignoring case.
 */
export async function emailVerified(container: MedusaContainer, email: string): Promise<boolean> {
  const auth = container.resolve(Modules.AUTH)
  const wanted = email.toLowerCase()
  const identities = (
    await auth.listProviderIdentities({
      entity_id: { $ilike: wanted },
      provider: "emailpass",
    } as unknown as Parameters<typeof auth.listProviderIdentities>[0])
  ).filter((p) => p.entity_id.toLowerCase() === wanted)
  for (const identity of identities) {
    const verifications = await auth.listAuthVerifications({
      auth_identity_id: identity.auth_identity_id!,
      entity_type: "email",
    })
    if (verifications.some((v) => !!v.verified_at && v.entity_id.toLowerCase() === wanted)) {
      return true
    }
  }
  return false
}

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
  const origin = [env.VENDOR_PORTAL_URL, ...(env.VENDOR_CORS ?? "").split(",")]
    .map((o) => (o ?? "").trim())
    .find((o) => /^https?:\/\//.test(o))
  if (!origin) {
    return null
  }
  return `${origin.replace(/\/+$/, "")}/${page}?${new URLSearchParams(params)}`
}
