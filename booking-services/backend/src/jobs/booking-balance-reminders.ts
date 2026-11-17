import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { sendBalanceRemindersWorkflow } from "../workflows/send-balance-reminders"

// Every hour, on the worker (TASKS P3-26): balance reminders due now.
export default async function bookingBalanceReminders(container: MedusaContainer) {
  const { result } = await sendBalanceRemindersWorkflow(container).run({ input: {} })
  if (result.length) {
    container.resolve(ContainerRegistrationKeys.LOGGER).info(`Balance reminders sent: ${result.length}.`)
  }
}

export const config = {
  name: "booking-balance-reminders",
  schedule: "15 * * * *",
}
