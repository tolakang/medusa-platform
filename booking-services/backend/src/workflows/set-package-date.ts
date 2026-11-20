import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createStep, createWorkflow, StepResponse, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { PACKAGE_DATE_KEY, PACKAGE_ITEM_KEY } from "../lib/packages"
import { notifyPackageChangedWorkflow } from "./notify-package-changed"

// After a whole event moved (TASKS P3-30 follow-up): the order's package line
// gets the new event date (so the Events page and emails say it), then the
// customer gets one email.
const setPackageDateStep = createStep(
  "set-package-date",
  async (input: { package_id: string; date: string }, { container }) => {
    const {
      data: [piece],
    } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
      entity: "booking",
      fields: ["order.items.id", "order.items.metadata"],
      filters: { package_id: input.package_id },
    })
    const head = (piece?.order?.items ?? []).find((i) => {
      const m = (i?.metadata ?? {}) as Record<string, unknown>
      return m[PACKAGE_ITEM_KEY] === input.package_id && !m.booking_id
    })
    if (!head) return new StepResponse(null, null)
    const before = (head.metadata ?? {}) as Record<string, unknown>
    await container
      .resolve(Modules.ORDER)
      .updateOrderLineItems([{ selector: { id: head.id }, data: { metadata: { ...before, [PACKAGE_DATE_KEY]: input.date } } }])
    return new StepResponse(String(before[PACKAGE_DATE_KEY] ?? ""), { id: head.id, metadata: before })
  },
  async (prev, { container }) => {
    if (prev) {
      await container.resolve(Modules.ORDER).updateOrderLineItems([{ selector: { id: prev.id }, data: { metadata: prev.metadata } }])
    }
  }
)

export const setPackageDateWorkflow = createWorkflow("set-package-date", function (input: { package_id: string; date: string }) {
  const previous = setPackageDateStep(input)
  // The email says the old date (the step returns it) and the new one.
  notifyPackageChangedWorkflow.runAsStep({
    input: transform({ previous, input }, ({ previous, input }) => ({
      package_id: input.package_id,
      kind: "moved" as const,
      new_date: input.date,
      old_date: previous || null,
    })),
  })
  return new WorkflowResponse(previous)
})
