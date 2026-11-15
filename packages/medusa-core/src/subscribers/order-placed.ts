import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { notifyOrderPlacedWorkflow } from "../workflows/notify-order-placed"

// Library mode (BUILD_PLAN.md §4.1): an app turns this on with a one-line
// file in its own src/subscribers:
//   export { default, config } from "@medusa-platform/medusa-core/subscribers/order-placed"
// Payload of order.placed is the order ID (Medusa docs, events and subscribers).
export default async function orderPlacedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  await notifyOrderPlacedWorkflow(container).run({ input: { id: data.id } })
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
