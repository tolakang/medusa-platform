import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { flagRefundedOrder } from "../workflows/provider-commission"

// A refund on an order that its booking cancels don't explain (an admin
// refund) holds its partner commissions for review at once (TASKS P3-33). The
// payout job checks again, so a missed event only delays the hold.
export default async function bookingCommissionPaymentRefunded({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const {
    data: [payment],
  } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "payment",
    fields: ["id", "payment_collection.order.id"],
    filters: { id: data.id },
  })
  const orderId = payment?.payment_collection?.order?.id
  if (orderId) {
    await flagRefundedOrder(container, orderId)
  }
}

export const config: SubscriberConfig = { event: "payment.refunded" }
