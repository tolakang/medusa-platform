import {
  createWorkflow,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { sendNotificationsStep, useQueryGraphStep } from "@medusajs/medusa/core-flows"
import {
  PAYMENT_REFUNDED_STAFF_TEMPLATE,
  REFUND_ALERT_FIELDS,
  refundAlertData,
  type RefundAlertPayment,
} from "../lib/refund-alert"

// Payment refunded → alert to the staff group (channel "telegram"), once per
// refund. Retry-safe like notify-order-placed: the Notification Module skips
// a notification whose idempotency_key already succeeded. A payment with no
// order (or no refund) sends nothing.
export const notifyPaymentRefundedWorkflow = createWorkflow(
  "notify-payment-refunded",
  function (input: { id: string }) {
    const { data: payments } = useQueryGraphStep({
      entity: "payment",
      fields: REFUND_ALERT_FIELDS,
      filters: { id: input.id },
    })

    const notifications = transform({ payments }, ({ payments }) => {
      const data = refundAlertData(payments[0] as RefundAlertPayment | undefined)
      if (!data) {
        return []
      }
      return [
        {
          // The Telegram provider always posts to its configured staff chat.
          to: "staff",
          channel: "telegram",
          template: PAYMENT_REFUNDED_STAFF_TEMPLATE,
          data,
          trigger_type: "payment.refunded",
          resource_id: data.order.id,
          resource_type: "order",
          idempotency_key: `payment-refunded:telegram:${data.refund.id}`,
        },
      ]
    })

    // An empty list creates nothing (@medusajs/notification createNotifications_).
    const sent = sendNotificationsStep(notifications)
    return new WorkflowResponse(sent)
  }
)
