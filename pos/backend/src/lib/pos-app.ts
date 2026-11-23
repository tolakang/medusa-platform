import { portalLink } from "@medusa-platform/medusa-core/lib/email-verified"

// The POS app's pages (design critique, 2026-11-23): POS_APP_URL, or the
// first POS_CORS origin.
export function posAppLink(
  page: "reset-password",
  params: Record<string, string>,
  env: NodeJS.ProcessEnv = process.env
): string | null {
  return portalLink(page, params, env.POS_APP_URL, env.POS_CORS)
}
