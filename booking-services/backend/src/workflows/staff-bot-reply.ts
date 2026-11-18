import { TELEGRAM_TEXT_TEMPLATE } from "@medusa-platform/medusa-core/lib/telegram/templates"
import { createWorkflow, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { sendNotificationsStep } from "@medusajs/medusa/core-flows"
import { staffStartReply } from "../lib/staff-bot"
import { STAFF_DIRECT_CHANNEL } from "./send-booking-jobs"

// Reply to a person's /start on the staff bot with their chat ID (TASKS
// P3-28 follow-up), through the telegram-staff provider.
export const staffBotReplyWorkflow = createWorkflow("staff-bot-reply", function (input: { chat_id: string }) {
  const sent = sendNotificationsStep(
    transform({ input }, ({ input }) => [
      {
        to: input.chat_id,
        channel: STAFF_DIRECT_CHANNEL,
        template: TELEGRAM_TEXT_TEMPLATE,
        data: { text: staffStartReply(input.chat_id) },
      },
    ])
  )
  return new WorkflowResponse(sent)
})
