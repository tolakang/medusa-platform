import { createStep, createWorkflow, StepResponse, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { deleteLineItemsWorkflow } from "@medusajs/medusa/core-flows"
import { BOOKING_MODULE } from "../modules/booking"
import type BookingModuleService from "../modules/booking/service"

// A weekly series (TASKS P3-29) or an event package (P3-30) that couldn't be
// booked whole: the lines already added come back out of the cart, and their
// holds stop blocking. A package's own line has no booking.

type Input = { cart_id: string; added: { booking_id?: string | null; line_item_id: string }[] }

const expireSeriesHoldsStep = createStep("expire-series-holds", async (input: Input, { container }) => {
  const holds = input.added.map((a) => a.booking_id).filter((id): id is string => !!id)
  if (holds.length) {
    await container
      .resolve<BookingModuleService>(BOOKING_MODULE)
      .updateBookings(holds.map((id) => ({ id, status: "expired" as const, hold_expires_at: null })))
  }
  return new StepResponse(holds.length)
})

export const releaseSeriesHoldsWorkflow = createWorkflow("release-series-holds", function (input: Input) {
  deleteLineItemsWorkflow.runAsStep({
    input: transform({ input }, ({ input }) => ({ cart_id: input.cart_id, ids: input.added.map((a) => a.line_item_id) })),
  })
  return new WorkflowResponse(expireSeriesHoldsStep(input))
})
