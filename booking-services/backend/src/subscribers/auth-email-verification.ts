// Email verification from the shared core (BUILD_PLAN.md §4.2 Account security),
// with this app's hook: the provider portal asks with `metadata: { actor:
// "provider" }`, so the link opens its own /verify-account page instead of the
// storefront's (TASKS P3-31), as Marketplace does for vendors.
import { config, emailVerificationSubscriber } from "@medusa-platform/medusa-core/subscribers/auth-email-verification"
import { PROVIDER_ACTOR_METADATA, providerPortalLink } from "../lib/provider-email"

export default emailVerificationSubscriber((data, params) =>
  data.metadata?.actor === PROVIDER_ACTOR_METADATA.actor
    ? {
        url: providerPortalLink("verify-account", params),
        missing: "Provider email verification not sent: set PROVIDER_PORTAL_URL (or PROVIDER_CORS).",
      }
    : undefined
)

export { config }
