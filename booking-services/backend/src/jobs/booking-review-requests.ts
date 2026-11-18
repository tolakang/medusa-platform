import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { sendReviewRequestsWorkflow } from "../workflows/send-review-requests"

// Every hour, on the worker (TASKS P3-29 follow-up): ask for a review after
// a booking has ended.
export default async function bookingReviewRequests(container: MedusaContainer) {
  const { result } = await sendReviewRequestsWorkflow(container).run({ input: {} })
  if (result.length) {
    container.resolve(ContainerRegistrationKeys.LOGGER).info(`Review requests sent: ${result.length}.`)
  }
}

export const config = {
  name: "booking-review-requests",
  schedule: "25 * * * *",
}
