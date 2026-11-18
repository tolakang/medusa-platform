import { safeEqual } from "@medusa-platform/medusa-core/lib/safe-equal"
import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { isStaffIdCommand, STAFF_WEBHOOK_SECRET_HEADER } from "../../../lib/staff-bot"
import { staffBotReplyWorkflow } from "../../../workflows/staff-bot-reply"

// POST /telegram/staff-webhook (TASKS P3-28 follow-up): updates for the
// staff bot, set up with src/scripts/telegram-set-staff-webhook.ts. A private
// /start or /id gets the chat ID back (without TELEGRAM_BOT_TOKEN the reply is
// only logged). Needs TELEGRAM_STAFF_WEBHOOK_SECRET; Telegram sends it in
// X-Telegram-Bot-Api-Secret-Token and retries on any non-2xx, so after the
// secret check this always answers 200.
type Update = { message?: { text?: string; chat?: { id?: number; type?: string } } }

export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const secret = process.env.TELEGRAM_STAFF_WEBHOOK_SECRET
  if (!secret) {
    return res.status(404).json({ message: "The staff bot webhook is not set up." })
  }
  if (!safeEqual(req.headers[STAFF_WEBHOOK_SECRET_HEADER], secret)) {
    return res.status(401).json({ message: "Unauthorized" })
  }
  const message = (req.body as Update | undefined)?.message
  const chatId = message?.chat?.id
  if (typeof chatId === "number" && message?.chat?.type === "private" && isStaffIdCommand(message.text)) {
    try {
      await staffBotReplyWorkflow(req.scope).run({ input: { chat_id: String(chatId) } })
    } catch (e) {
      req.scope.resolve(ContainerRegistrationKeys.LOGGER).warn(`Staff bot /start could not be answered: ${(e as Error).message}`)
    }
  }
  res.status(200).json({ ok: true })
}
