import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { notifyPaymentRefundedWorkflow } from "../workflows/notify-payment-refunded"

// Library mode (BUILD_PLAN.md §4.1): an app turns this on with a one-line
// file in its own src/subscribers:
//   export { default, config } from "@medusa-platform/medusa-core/subscribers/payment-refunded-alert"
// payment.refunded carries the payment's ID (@medusajs/utils PaymentEvents).
export default async function paymentRefundedAlert({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  await notifyPaymentRefundedWorkflow(container).run({ input: { id: data.id } })
}

export const config: SubscriberConfig = {
  event: "payment.refunded",
}
