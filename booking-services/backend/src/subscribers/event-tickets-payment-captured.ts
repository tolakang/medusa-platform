import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { issueEventTicketsWorkflow } from "../workflows/issue-event-tickets"

// A pay-later order's event tickets are emailed once its payment is captured
// (owner, 2026-11-25). `payment.captured` carries the payment's id; the order
// is reached through `payment_collection.order` (MEDUSA_SKILL §6, order
// cancel and refund events). The workflow emails only when the order is fully
// paid, once (idempotency key), so a partial capture sends nothing yet.
export default async function eventTicketsPaymentCapturedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [payment],
  } = await query.graph({
    entity: "payment",
    fields: ["payment_collection.order.id"],
    filters: { id: data.id },
  })
  const orderId = payment?.payment_collection?.order?.id
  if (!orderId) {
    return
  }
  await issueEventTicketsWorkflow(container).run({ input: { order_id: orderId } })
}

export const config: SubscriberConfig = { event: "payment.captured" }
