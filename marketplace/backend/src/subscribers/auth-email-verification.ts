// Email verification from the shared core (BUILD_PLAN.md §4.2), with this app's
// hook: the vendor portal asks with `metadata: { actor: "vendor" }`, so the link
// opens its own /verify-account page instead of the storefront's (review 2, A3).
import { config, emailVerificationSubscriber } from "@medusa-platform/medusa-core/subscribers/auth-email-verification"
import { VENDOR_ACTOR_METADATA, vendorPortalLink } from "../lib/vendor-email"

export default emailVerificationSubscriber((data, params) =>
  data.metadata?.actor === VENDOR_ACTOR_METADATA.actor
    ? {
        url: vendorPortalLink("verify-account", params),
        missing: "Vendor email verification not sent: set VENDOR_PORTAL_URL (or VENDOR_CORS).",
      }
    : undefined
)

export { config }
