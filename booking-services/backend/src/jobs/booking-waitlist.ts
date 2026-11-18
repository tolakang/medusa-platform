import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { notifyWaitlistWorkflow } from "../workflows/booking-waitlist"

// Every 15 minutes, on the worker (TASKS P3-29): email the people waiting for
// a day that has a free time again. Catches every way a time frees up
// (cancelled, hold run out, moved, new hours) without hooking each one.
export default async function bookingWaitlist(container: MedusaContainer) {
  const { result } = await notifyWaitlistWorkflow(container).run({ input: {} })
  if (result.length) {
    container.resolve(ContainerRegistrationKeys.LOGGER).info(`Waitlist emails sent: ${result.length}.`)
  }
}

export const config = {
  name: "booking-waitlist",
  schedule: "*/15 * * * *",
}
