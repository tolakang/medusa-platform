import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { BOOKING_MODULE } from "../modules/booking"
import type BookingModuleService from "../modules/booking/service"

// Quote first (TASKS P3-27 follow-up): a priced quote past its valid_until
// becomes `expired` (it was only read as expired when used), so the admin's
// Quotes filter and the customer's list agree.
const expireQuotesStep = createStep("expire-quotes", async (input: { now?: string }, { container }) => {
  const booking = container.resolve<BookingModuleService>(BOOKING_MODULE)
  const now = input.now ? new Date(input.now) : new Date()
  const stale = (await booking.listBookingQuotes({ status: "quoted" })).filter(
    (q) => q.valid_until && new Date(q.valid_until).getTime() < now.getTime()
  )
  if (stale.length) {
    await booking.updateBookingQuotes(stale.map((q) => ({ id: q.id, status: "expired" as const })))
  }
  return new StepResponse(stale.map((q) => q.id), stale.map((q) => q.id))
}, async (ids, { container }) => {
  if (ids?.length) {
    await container.resolve<BookingModuleService>(BOOKING_MODULE).updateBookingQuotes(ids.map((id) => ({ id, status: "quoted" as const })))
  }
})

export const expireQuotesWorkflow = createWorkflow("expire-quotes", function (input: { now?: string }) {
  return new WorkflowResponse(expireQuotesStep(input))
})
