// Password reset emails, from the shared core (plan §4.1, §4.2 Account
// security), with this app's hook: a vendor's link opens the vendor portal's
// /reset-password page (design critique, 2026-11-23).
import { config, passwordResetSubscriber } from "@medusa-platform/medusa-core/subscribers/auth-password-reset"
import { vendorPortalLink } from "../lib/vendor-email"

export default passwordResetSubscriber((data, params) =>
  data.actor_type === "vendor"
    ? {
        url: vendorPortalLink("reset-password", params),
        missing: "Vendor password reset email not sent: set VENDOR_PORTAL_URL (or VENDOR_CORS).",
      }
    : undefined
)

export { config }
