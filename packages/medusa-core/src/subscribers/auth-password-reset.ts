import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { AuthWorkflowEvents, ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { adminLink, authEmailKey, PASSWORD_RESET_TEMPLATE, storefrontLink } from "../lib/auth-email"
import { sendAuthEmailWorkflow } from "../workflows/send-auth-email"

// Password reset email (TASKS P1-18), docs "Handle Password Reset Event".
// Payload of auth.password_reset (@medusajs/utils AuthWorkflowEvents):
// entity_id (the email for emailpass), actor_type, token, metadata. The token
// is single-use and expires after 15 minutes (docs). Customers get the
// storefront's /reset-password page; admin users ("user") get the admin
// dashboard's own /app/reset-password page. The hook: an app with another
// actor type builds its own handler with passwordResetSubscriber(link).
export type PasswordReset = {
  entity_id: string
  actor_type: string
  token: string
  metadata?: Record<string, unknown>
}

// Returns the page link for another actor type (Booking's provider portal,
// TASKS P3-32) and the warning to log when it can't be built; `undefined` =
// not this app's case (customers and admin users keep their own links).
export type PasswordResetLink = (
  data: PasswordReset,
  params: Record<string, string>
) => { url: string | null; missing: string } | undefined

export function passwordResetSubscriber(link?: PasswordResetLink) {
  return async function authPasswordReset({ event: { data }, container }: SubscriberArgs<PasswordReset>) {
    const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
    const config = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
    const params = { token: data.token, email: data.entity_id }
    const target = link?.(data, params) ?? {
      url:
        data.actor_type === "customer"
          ? storefrontLink(config, "reset-password", params)
          : data.actor_type === "user"
            ? adminLink(config, params)
            : null,
      missing: `Password reset email not sent for actor type "${data.actor_type}": no link.`,
    }
    if (!target.url) {
      logger.warn(target.missing)
      return
    }
    await sendAuthEmailWorkflow(container).run({
      input: {
        to: data.entity_id,
        template: PASSWORD_RESET_TEMPLATE,
        data: { url: target.url, expires_minutes: 15 },
        idempotency_key: authEmailKey("password-reset", data.token),
      },
    })
  }
}

export default passwordResetSubscriber()

export const config: SubscriberConfig = {
  event: AuthWorkflowEvents.PASSWORD_RESET,
}
