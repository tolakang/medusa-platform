// Password reset emails, from the shared core (plan §4.1, §4.2 Account
// security), with this app's hook: a seller's link opens the seller portal's
// /reset-password page (design critique, 2026-11-23).
import { config, passwordResetSubscriber } from "@medusa-platform/medusa-core/subscribers/auth-password-reset"
import { sellerPortalLink } from "../lib/seller-portal"

export default passwordResetSubscriber((data, params) =>
  data.actor_type === "seller"
    ? {
        url: sellerPortalLink("reset-password", params),
        missing: "Seller password reset email not sent: set SELLER_PORTAL_URL (or SELLER_CORS).",
      }
    : undefined
)

export { config }
