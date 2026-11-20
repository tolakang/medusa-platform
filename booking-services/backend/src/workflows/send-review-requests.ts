import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createStep, createWorkflow, StepResponse, when, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { sendNotificationsStep } from "@medusajs/medusa/core-flows"
import { REVIEW_REQUEST_TEMPLATE, type ReviewRequestData } from "../lib/reviews"

// TASKS P3-29 follow-up: email customers whose booking ended between two days
// and an hour ago, once per booking (the notification's idempotency key),
// unless they reviewed it already. Paid bookings only (with an order).

type Notice = { to: string; channel: string; template: string; data: ReviewRequestData; idempotency_key: string }

const dueReviewRequestsStep = createStep("due-review-requests", async (input: { now?: string }, { container }) => {
  const now = input.now ? new Date(input.now) : new Date()
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: ended } = await query.graph({
    entity: "booking",
    fields: ["id", "customer_id", "ends_at", "order.id", "order.email", "order.items.product_title", "order.items.metadata"],
    filters: {
      status: ["confirmed", "completed"],
      ends_at: { $gte: new Date(now.getTime() - 48 * 3600_000), $lte: new Date(now.getTime() - 3600_000) },
    },
  })
  const paid = ended.filter((b) => b.order?.email)
  if (!paid.length) return new StepResponse([] as Notice[])
  // Once per order (review finding: the key was per booking, so a series
  // got one a week): keyed by the order.
  const keyOf = (orderId: string) => `booking_review_request_order_${orderId}`
  const keys = [...new Set(paid.map((b) => keyOf(b.order!.id)))]
  const [{ data: sent }, { data: reviewed }, { data: customers }] = await Promise.all([
    query.graph({ entity: "notification", fields: ["idempotency_key"], filters: { idempotency_key: keys } }),
    query.graph({ entity: "booking_review", fields: ["booking_id"], filters: { booking_id: paid.map((b) => b.id) } }),
    query.graph({
      entity: "customer",
      fields: ["id", "first_name", "last_name"],
      filters: { id: [...new Set(paid.map((b) => b.customer_id).filter(Boolean) as string[])] },
    }),
  ])
  const reviewedBookings = new Set(reviewed.map((r) => r.booking_id))
  const done = new Set([
    ...sent.map((n) => n.idempotency_key),
    ...paid.filter((b) => reviewedBookings.has(b.id)).map((b) => keyOf(b.order!.id)),
  ])
  const shop = process.env.STOREFRONT_URL?.replace(/\/+$/, "")
  const notices: Notice[] = []
  // One email per order, for its first booking that ended.
  const seenOrders = new Set<string>()
  for (const b of paid) {
    const key = keyOf(b.order!.id)
    if (done.has(key) || seenOrders.has(b.order!.id)) continue
    seenOrders.add(b.order!.id)
    const item = (b.order?.items ?? []).find((i) => (i?.metadata as Record<string, unknown> | null)?.booking_id === b.id)
    const c = customers.find((x) => x.id === b.customer_id)
    notices.push({
      to: b.order!.email!,
      channel: "email",
      template: REVIEW_REQUEST_TEMPLATE,
      data: {
        customer_name: [c?.first_name, c?.last_name].filter(Boolean).join(" ") || null,
        service: item?.product_title ?? "your booking",
        url: shop ? `${shop}/account/bookings` : null,
      },
      idempotency_key: key,
    })
  }
  return new StepResponse(notices)
})

export const sendReviewRequestsWorkflow = createWorkflow("send-review-requests", function (input: { now?: string }) {
  const notices = dueReviewRequestsStep(input)
  when("any-review-request", notices, (n) => n.length > 0).then(() => {
    sendNotificationsStep(notices)
  })
  return new WorkflowResponse(notices)
})
