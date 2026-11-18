// The staff bot's own answer to /start (TASKS P3-28 follow-up): a person who
// messages the staff bot privately learns their chat ID, which the shop
// enters on their calendar ("Telegram chat for jobs") to send them their jobs.
// Pure, unit-tested.

export const STAFF_WEBHOOK_SECRET_HEADER = "x-telegram-bot-api-secret-token"

export function staffStartReply(chatId: number | string): string {
  return [
    `Your chat ID is ${chatId}.`,
    "Give it to the shop: they enter it on your calendar (Bookings → Telegram chat for jobs),",
    "and your new and moved jobs come here.",
  ].join("\n")
}

// Only "/start" or "/id" (with or without a payload or @bot name).
export function isStaffIdCommand(text: unknown): boolean {
  return typeof text === "string" && /^\/(start|id)(@\w+)?(\s|$)/.test(text.trim())
}
