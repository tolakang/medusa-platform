import { portalLink } from "@medusa-platform/medusa-core/lib/email-verified"

// The seller portal's pages (design critique, 2026-11-23): SELLER_PORTAL_URL, or the
// first SELLER_CORS origin.
export function sellerPortalLink(
  page: "reset-password",
  params: Record<string, string>,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  return portalLink(page, params, env.SELLER_PORTAL_URL, env.SELLER_CORS)
}
