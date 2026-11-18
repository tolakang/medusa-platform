import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { expireQuotesWorkflow } from "../workflows/expire-quotes"

// Every hour, on the worker (TASKS P3-27 follow-up): priced quotes past their
// date become expired.
export default async function bookingQuoteExpiry(container: MedusaContainer) {
  const { result } = await expireQuotesWorkflow(container).run({ input: {} })
  if (result.length) {
    container.resolve(ContainerRegistrationKeys.LOGGER).info(`Quotes expired: ${result.length}.`)
  }
}

export const config = {
  name: "booking-quote-expiry",
  schedule: "40 * * * *",
}
