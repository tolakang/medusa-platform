import type { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

// Helpers for actors that confirm their email before an admin approves them:
// Marketplace vendors (review 2, A3) and Booking partners (TASKS P3-31).
// BUILD_PLAN §4.2 Account security, TASKS F-100.

/**
 * Whether the sign-in email (emailpass) has a confirmed verification. Actor
 * records store the email lowercase, while the sign-in identity keeps the
 * case it was registered with, so both match ignoring case.
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

/**
 * A page of a portal (vendor portal, provider portal): its own URL setting, or
 * else the first http(s) origin of its CORS list (the portal's origin, as for
 * the admin). Null when neither is set.
 */
export function portalLink(
  page: string,
  params: Record<string, string>,
  url: string | undefined,
  cors: string | undefined
): string | null {
  const origin = [url, ...(cors ?? "").split(",")]
    .map((o) => (o ?? "").trim())
    .find((o) => /^https?:\/\//.test(o))
  if (!origin) {
    return null
  }
  return `${origin.replace(/\/+$/, "")}/${page}?${new URLSearchParams(params)}`
}
