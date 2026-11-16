// Password reset emails from the shared core (§4.2 Account security), with
// this app's hook: a provider's link opens the provider portal's
// /reset-password page (TASKS P3-32).
import { config, passwordResetSubscriber } from "@medusa-platform/medusa-core/subscribers/auth-password-reset"
import { providerPortalLink } from "../lib/provider-email"

export default passwordResetSubscriber((data, params) =>
  data.actor_type === "provider"
    ? {
        url: providerPortalLink("reset-password", params),
        missing: "Provider password reset email not sent: set PROVIDER_PORTAL_URL (or PROVIDER_CORS).",
      }
    : undefined
)

export { config }
