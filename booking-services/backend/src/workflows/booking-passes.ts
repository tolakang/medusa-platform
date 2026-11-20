import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { passCreditsOf, PASS_ITEM_KEY, passProduct } from "../lib/passes"
import { BOOKING_MODULE } from "../modules/booking"
import type BookingModuleService from "../modules/booking/service"

// Passes (TASKS P3-29). On order.placed: a pass for each pass line bought
// (credits × quantity), and one credit taken for each booking paid with a
// pass. On a cancellation within the policy the credit comes back.

const service = (c: { resolve: (k: string) => unknown }) => c.resolve(BOOKING_MODULE) as BookingModuleService

type Item = { id: string; product_id?: string | null; quantity?: unknown; metadata?: Record<string, unknown> | null; title?: string | null; product_title?: string | null }

const loadOrder = async (container: { resolve: (k: string) => unknown }, orderId: string) => {
  const query = (container.resolve(ContainerRegistrationKeys.QUERY) as { graph: (q: unknown) => Promise<{ data: any[] }> })
  const {
    data: [order],
  } = await query.graph({
    entity: "order",
    fields: ["id", "customer_id", "items.id", "items.product_id", "items.quantity", "items.metadata", "items.product_title"],
    filters: { id: orderId },
  })
  return { query, order: order as { id: string; customer_id?: string | null; items?: Item[] } | undefined }
}

const issuePassesStep = createStep(
  "issue-passes",
  async (input: { order_id: string }, { container }) => {
    const { query, order } = await loadOrder(container, input.order_id)
    const items = order?.items ?? []
    const productIds = [...new Set(items.map((i) => i.product_id).filter(Boolean) as string[])]
    if (!order?.customer_id || !productIds.length) return new StepResponse([] as string[], [] as string[])
    const { data: products } = await query.graph({ entity: "product", fields: ["id", "metadata"], filters: { id: productIds } })
    const created: string[] = []
    const booking = service(container)
    for (const item of items) {
      const product = products.find((p) => p.id === item.product_id)
      const pass = passProduct(product?.metadata)
      if (!pass) continue
      // Once per order line.
      if ((await booking.listBookingPasses({ line_item_id: item.id })).length) continue
      const { data: covered } = await query.graph({ entity: "product", fields: ["id"], filters: { handle: pass.covers } })
      const credits = pass.credits * Math.max(Number(item.quantity) || 1, 1)
      const row = await booking.createBookingPasses({
        customer_id: order.customer_id,
        order_id: order.id,
        line_item_id: item.id,
        product_id: item.product_id!,
        title: item.product_title ?? "Pass",
        credits_total: credits,
        credits_left: credits,
        expires_at: new Date(Date.now() + pass.valid_days * 86_400_000),
        // A JSON list of product IDs.
        product_ids: covered.map((p: { id: string }) => p.id) as unknown as Record<string, unknown>,
      })
      created.push(row.id)
    }
    return new StepResponse(created, created)
  },
  async (created, { container }) => {
    if (created?.length) await service(container).deleteBookingPasses(created)
  }
)

const takePassCreditsStep = createStep(
  "take-pass-credits",
  async (input: { order_id: string }, { container }) => {
    const { order } = await loadOrder(container, input.order_id)
    const booking = service(container)
    const taken: { use_id: string; pass_id: string; credits: number }[] = []
    const unpaid: string[] = []
    for (const item of order?.items ?? []) {
      const passId = item.metadata?.[PASS_ITEM_KEY]
      const bookingId = item.metadata?.booking_id
      if (typeof passId !== "string" || typeof bookingId !== "string") continue
      if ((await booking.listBookingPassUses({ booking_id: bookingId })).length) continue
      const credits = passCreditsOf(item.metadata)
      // Atomic: the pass row is locked while its credits are taken.
      if (!(await booking.takePassCredits({ pass_id: passId, credits }))) {
        // Another order spent the last credits meanwhile: this $0 booking
        // isn't paid, so it is cancelled instead of kept for free (review
        // finding), and the shop is told in the log.
        unpaid.push(bookingId)
        continue
      }
      const use = await booking.createBookingPassUses({ pass_id: passId, booking_id: bookingId, credits })
      taken.push({ use_id: use.id, pass_id: passId, credits })
    }
    if (unpaid.length) {
      await booking.updateBookings(unpaid.map((id) => ({ id, status: "cancelled" as const, hold_expires_at: null })))
      ;(container.resolve(ContainerRegistrationKeys.LOGGER) as { warn: (m: string) => void }).warn(
        `Pass bookings cancelled, the pass had no credits left: ${unpaid.join(", ")} (order ${input.order_id}).`
      )
    }
    return new StepResponse(taken.length, taken)
  },
  async (taken, { container }) => {
    const booking = service(container)
    for (const t of taken ?? []) {
      const [pass] = await booking.listBookingPasses({ id: t.pass_id })
      if (pass) await booking.updateBookingPasses({ id: pass.id, credits_left: pass.credits_left + t.credits })
      await booking.deleteBookingPassUses(t.use_id)
    }
  }
)

export const placeOrderPassesWorkflow = createWorkflow("place-order-passes", function (input: { order_id: string }) {
  const issued = issuePassesStep(input)
  const taken = takePassCreditsStep(input)
  return new WorkflowResponse({ issued, taken })
})

// A cancelled booking paid with a pass gets its credits back (called by
// cancel-booking): within the policy, or whenever staff cancel it (P3-29
// follow-up: the shop's own cancellation never costs the customer a credit).
export const returnPassCreditStep = createStep(
  "return-pass-credit",
  async (input: { booking_id: string; within_policy: boolean }, { container }) => {
    if (!input.within_policy) return new StepResponse(false, null)
    const booking = service(container)
    const [use] = await booking.listBookingPassUses({ booking_id: input.booking_id, status: "used" })
    if (!use) return new StepResponse(false, null)
    const [pass] = await booking.listBookingPasses({ id: use.pass_id })
    if (!pass) return new StepResponse(false, null)
    const credits = use.credits ?? 1
    await booking.updateBookingPasses({ id: pass.id, credits_left: Math.min(pass.credits_left + credits, pass.credits_total) })
    await booking.updateBookingPassUses({ id: use.id, status: "returned" })
    return new StepResponse(true, { use_id: use.id, pass_id: pass.id, credits })
  },
  async (prev, { container }) => {
    if (!prev) return
    const booking = service(container)
    const [pass] = await booking.listBookingPasses({ id: prev.pass_id })
    if (pass) await booking.updateBookingPasses({ id: pass.id, credits_left: Math.max(pass.credits_left - prev.credits, 0) })
    await booking.updateBookingPassUses({ id: prev.use_id, status: "used" })
  }
)
