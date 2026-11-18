import { createStep, createWorkflow, StepResponse, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { deleteLineItemsWorkflow } from "@medusajs/medusa/core-flows"
import { BOOKING_MODULE } from "../modules/booking"
import type BookingModuleService from "../modules/booking/service"

// A weekly series that couldn't be booked whole (TASKS P3-29): the weeks
// already added come back out of the cart, and their holds stop blocking.

type Input = { cart_id: string; added: { booking_id: string; line_item_id: string }[] }

const expireSeriesHoldsStep = createStep("expire-series-holds", async (input: Input, { container }) => {
  if (input.added.length) {
    await container
      .resolve<BookingModuleService>(BOOKING_MODULE)
      .updateBookings(input.added.map((a) => ({ id: a.booking_id, status: "expired" as const, hold_expires_at: null })))
  }
  return new StepResponse(input.added.length)
})

export const releaseSeriesHoldsWorkflow = createWorkflow("release-series-holds", function (input: Input) {
  deleteLineItemsWorkflow.runAsStep({
    input: transform({ input }, ({ input }) => ({ cart_id: input.cart_id, ids: input.added.map((a) => a.line_item_id) })),
  })
  return new WorkflowResponse(expireSeriesHoldsStep(input))
})
