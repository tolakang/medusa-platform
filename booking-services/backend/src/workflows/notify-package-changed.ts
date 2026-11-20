import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createStep, createWorkflow, StepResponse, when, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { sendNotificationsStep } from "@medusajs/medusa/core-flows"
import { PACKAGE_DATE_KEY, PACKAGE_ITEM_KEY } from "../lib/packages"
import { PACKAGE_CHANGED_TEMPLATE, type PackageChangedData } from "../lib/package-email"

// TASKS P3-30 follow-up: one email to the customer when staff cancel or move
// their event package (title and date from the order's package line).
type Input = {
  package_id: string
  kind: "cancelled" | "moved"
  new_date?: string | null
  // The date before a move (the line already has the new one by then).
  old_date?: string | null
  refunded_amount?: number | null
}
type Notice = { to: string; channel: string; template: string; data: PackageChangedData; idempotency_key: string }

const buildPackageNoticeStep = createStep("build-package-notice", async (input: Input, { container }) => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [piece],
  } = await query.graph({
    entity: "booking",
    fields: ["order.email", "order.currency_code", "order.customer.first_name", "order.customer.last_name", "order.items.product_title", "order.items.metadata"],
    filters: { package_id: input.package_id },
  })
  const order = piece?.order
  if (!order?.email) return new StepResponse([] as Notice[])
  const head = (order.items ?? []).find((i) => {
    const m = (i?.metadata ?? {}) as Record<string, unknown>
    return m[PACKAGE_ITEM_KEY] === input.package_id && !m.booking_id
  })
  const eventDate = input.old_date ?? ((head?.metadata ?? {}) as Record<string, unknown>)[PACKAGE_DATE_KEY]
  if (typeof eventDate !== "string") return new StepResponse([] as Notice[])
  const name = [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(" ")
  return new StepResponse<Notice[]>([
    {
      to: order.email,
      channel: "email",
      template: PACKAGE_CHANGED_TEMPLATE,
      data: {
        kind: input.kind,
        customer_name: name || null,
        title: head?.product_title ?? "Your event",
        event_date: eventDate,
        new_date: input.new_date ?? null,
        refunded_amount: input.refunded_amount ?? null,
        currency_code: order.currency_code,
      },
      idempotency_key: `booking_package_${input.kind}_${input.package_id}_${input.new_date ?? ""}`,
    },
  ])
})

export const notifyPackageChangedWorkflow = createWorkflow("notify-package-changed", function (input: Input) {
  const notices = buildPackageNoticeStep(input)
  when("any-package-notice", notices, (n) => n.length > 0).then(() => {
    sendNotificationsStep(notices)
  })
  return new WorkflowResponse(notices)
})
