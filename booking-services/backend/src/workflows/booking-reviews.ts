import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { REVIEW_NOT_YET_MESSAGE, REVIEW_NOT_YOURS_MESSAGE, REVIEW_TWICE_MESSAGE, reviewable, reviewAuthor } from "../lib/reviews"
import { BOOKING_MODULE } from "../modules/booking"
import type BookingModuleService from "../modules/booking/service"

// Reviews (TASKS P3-29): the customer reviews a booking they had, once; it's
// published at once and staff can hide it.

const service = (c: { resolve: (k: string) => unknown }) => c.resolve(BOOKING_MODULE) as BookingModuleService

export type WriteReviewInput = { booking_id: string; customer_id: string; rating: number; comment?: string | null }

const writeReviewStep = createStep(
  "write-review",
  async (input: WriteReviewInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const {
      data: [booking],
    } = await query.graph({
      entity: "booking",
      fields: ["id", "status", "ends_at", "customer_id", "resource.id", "order.items.product_id", "order.items.metadata"],
      filters: { id: input.booking_id },
    })
    if (!booking || booking.customer_id !== input.customer_id) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, REVIEW_NOT_YOURS_MESSAGE)
    }
    const item = (booking.order?.items ?? []).find((i) => (i?.metadata as Record<string, unknown> | null)?.booking_id === booking.id)
    if (!item?.product_id) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, REVIEW_NOT_YOURS_MESSAGE)
    }
    if (!reviewable(booking, new Date())) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, REVIEW_NOT_YET_MESSAGE)
    }
    const [already] = await service(container).listBookingReviews({ booking_id: booking.id })
    if (already) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, REVIEW_TWICE_MESSAGE)
    }
    const {
      data: [customer],
    } = await query.graph({ entity: "customer", fields: ["first_name", "last_name"], filters: { id: input.customer_id } })
    const review = await service(container).createBookingReviews({
      booking_id: booking.id,
      customer_id: input.customer_id,
      product_id: item.product_id,
      resource_id: booking.resource?.id ?? null,
      rating: input.rating,
      comment: input.comment?.trim() || null,
      author: reviewAuthor(customer?.first_name, customer?.last_name),
    })
    return new StepResponse(review, review.id)
  },
  async (id, { container }) => {
    if (id) await service(container).deleteBookingReviews(id)
  }
)

export const writeBookingReviewWorkflow = createWorkflow("write-booking-review", function (input: WriteReviewInput) {
  return new WorkflowResponse(writeReviewStep(input))
})

const setReviewStatusStep = createStep(
  "set-review-status",
  async (input: { id: string; status: "published" | "hidden" }, { container }) => {
    const [review] = await service(container).listBookingReviews({ id: input.id })
    if (!review) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Review ${input.id} was not found.`)
    }
    const updated = await service(container).updateBookingReviews({ id: review.id, status: input.status })
    return new StepResponse(updated, { id: review.id, status: review.status })
  },
  async (before, { container }) => {
    if (before) await service(container).updateBookingReviews(before as never)
  }
)

export const setBookingReviewStatusWorkflow = createWorkflow(
  "set-booking-review-status",
  function (input: { id: string; status: "published" | "hidden" }) {
    return new WorkflowResponse(setReviewStatusStep(input))
  }
)
