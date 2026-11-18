import type { ExecArgs } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"

// Telegram Bot API (as the core provider's TELEGRAM_API_URL).
const TELEGRAM_API_URL = "https://api.telegram.org"

// One-time setup of the staff bot's webhook (TASKS P3-28 follow-up), as the
// core's customer-bot script: Telegram Bot API setWebhook with url,
// secret_token and allowed_updates. Run on the server:
//   docker-entrypoint.sh medusa exec ./src/scripts/telegram-set-staff-webhook.js https://<api host>/telegram/staff-webhook
// Needs TELEGRAM_BOT_TOKEN and TELEGRAM_STAFF_WEBHOOK_SECRET in env.
export default async function telegramSetStaffWebhook({ container, args }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const [url] = args
  const token = process.env.TELEGRAM_BOT_TOKEN
  const secret = process.env.TELEGRAM_STAFF_WEBHOOK_SECRET
  if (!url?.startsWith("https://") || !token || !secret) {
    throw new MedusaError(
      MedusaError.Types.INVALID_ARGUMENT,
      "Usage: medusa exec ./src/scripts/telegram-set-staff-webhook.js https://<api host>/telegram/staff-webhook " +
        "(with TELEGRAM_BOT_TOKEN and TELEGRAM_STAFF_WEBHOOK_SECRET set)"
    )
  }
  const response = await fetch(`${TELEGRAM_API_URL}/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, secret_token: secret, allowed_updates: ["message"] }),
  })
  const body = (await response.json().catch(() => ({}))) as { ok?: boolean; description?: string }
  // The token is part of the request URL, so only Telegram's reply is logged.
  if (!response.ok || !body.ok) {
    throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, `Telegram setWebhook failed (${response.status}): ${body.description ?? "no description"}`)
  }
  logger.info(`Staff bot webhook set to ${url}: ${body.description ?? "ok"}`)
}
