import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import type { ConfigModule } from "@medusajs/framework/types"
import { AuthWorkflowEvents, ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { authEmailKey, storefrontLink, VERIFY_EMAIL_TEMPLATE } from "../lib/auth-email"
import { sendAuthEmailWorkflow } from "../workflows/send-auth-email"

// Email verification for new customer accounts (TASKS P1-18), enabled with
// http.authVerificationsPerActor in medusa-config.ts. Payload of
// auth.verification_requested since v2.17 (docs "Email Verification", Event
// Payload): entity_id (the email), entity_type, code, code_provider,
// auth_identity_id, expires_at, metadata. The storefront's /verify-account page
// confirms the code (POST /auth/verification/confirm).
//
// Shared core (BUILD_PLAN.md §4.2 Account security). An app turns it on with
//   export { default, config } from "@medusa-platform/medusa-core/subscribers/auth-email-verification"
// The hook: an app whose other actors verify elsewhere (Marketplace's vendor
// portal) builds its own handler with emailVerificationSubscriber(link).
export type VerificationRequested = {
  entity_id: string
  entity_type: string
  code: string
  code_provider: string
  auth_identity_id: string
  expires_at: string
  metadata?: Record<string, unknown>
}

// Returns the page link for this request and the warning to log when it can't
// be built; `undefined` = not this app's case, use the storefront link.
export type VerificationLink = (
  data: VerificationRequested,
  params: Record<string, string>,
  config: ConfigModule
) => { url: string | null; missing: string } | undefined

export function emailVerificationSubscriber(link?: VerificationLink) {
  return async function authEmailVerification({
    event: { data },
    container,
  }: SubscriberArgs<VerificationRequested>) {
    if (data.entity_type !== "email") {
      return
    }
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
    const config = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
    const params = { token: data.code, email: data.entity_id }
    const target = link?.(data, params, config) ?? {
      url: storefrontLink(config, "verify-account", params),
      missing: "Email verification not sent: set STOREFRONT_URL (admin.storefrontUrl).",
    }
    if (!target.url) {
      logger.warn(target.missing)
      return
    }
    const minutes = Math.round((new Date(data.expires_at).getTime() - Date.now()) / 60000)
    await sendAuthEmailWorkflow(container).run({
      input: {
        to: data.entity_id,
        template: VERIFY_EMAIL_TEMPLATE,
        data: { url: target.url, ...(Number.isFinite(minutes) && minutes > 0 ? { expires_minutes: minutes } : {}) },
        idempotency_key: authEmailKey("verify-email", data.code),
      },
    })
  }
}

export default emailVerificationSubscriber()

export const config: SubscriberConfig = {
  event: AuthWorkflowEvents.VERIFICATION_REQUESTED,
}
