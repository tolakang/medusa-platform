// Password reset emails, from the shared core (plan §4.1, §4.2 Account
// security), with this app's hook: a cashier's link opens the POS app's
// /reset-password page (design critique, 2026-11-23).
import { config, passwordResetSubscriber } from "@medusa-platform/medusa-core/subscribers/auth-password-reset"
import { posAppLink } from "../lib/pos-app"

export default passwordResetSubscriber((data, params) =>
  data.actor_type === "cashier"
    ? {
        url: posAppLink("reset-password", params),
        missing: "Cashier password reset email not sent: set POS_APP_URL (or POS_CORS).",
      }
    : undefined
)

export { config }
