import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { createStep, createWorkflow, StepResponse, transform, when, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { sendNotificationsStep } from "@medusajs/medusa/core-flows"
import { EVENT_TICKETS_TEMPLATE, isEventProduct, ticketCode } from "../lib/event-tickets"
import { BOOKING_MODULE } from "../modules/booking"
import type BookingModuleService from "../modules/booking/service"

// Event tickets (kind F, TASKS P3-24): when an order is placed, one ticket
// with its own code per unit of each event line item, then one email with
// all of them. Run by the order.placed subscriber; idempotent: a line item
// that already has tickets is skipped, and the email has an idempotency key.

type Issued = { code: string; event_title: string; label: string }

const issueTicketsStep = createStep(
  "issue-tickets",
  async (input: { order_id: string }, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const {
      data: [order],
    } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "email",
        "customer.first_name",
        "customer.last_name",
        "items.id",
        "items.quantity",
        "items.variant_id",
        "items.product_title",
        "items.variant_title",
        "items.variant.metadata",
        "items.variant.product.metadata",
      ],
      filters: { id: input.order_id },
    })
    if (!order) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Order ${input.order_id} was not found.`)
    }
    const lines = (order.items ?? []).filter((i) => i && isEventProduct(i.variant?.product))
    const empty = { email: null as string | null, data: null as Record<string, unknown> | null, order_id: order.id }
    if (!lines.length) {
      return new StepResponse(empty, [] as string[])
    }
    const booking = container.resolve<BookingModuleService>(BOOKING_MODULE)
    const done = new Set((await booking.listBookingTickets({ order_id: order.id })).map((t) => t.line_item_id))
    const rows = lines
      .filter((l) => !done.has(l!.id))
      .flatMap((l) => {
        const startsAt = (l!.variant?.metadata as Record<string, unknown> | null)?.event_starts_at
        return Array.from({ length: Number(l!.quantity) || 0 }, () => ({
          code: ticketCode(),
          order_id: order.id,
          line_item_id: l!.id,
          variant_id: l!.variant_id ?? null,
          event_title: l!.product_title ?? "Event",
          label: l!.variant_title ?? "",
          event_starts_at: typeof startsAt === "string" ? new Date(startsAt) : null,
        }))
      })
    if (!rows.length) {
      return new StepResponse(empty, [] as string[])
    }
    const created = await booking.createBookingTickets(rows)
    const tickets: Issued[] = created.map((t) => ({ code: t.code, event_title: t.event_title, label: t.label }))
    const name = [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(" ")
    return new StepResponse(
      {
        email: order.email ?? null,
        order_id: order.id,
        data: { order_display_id: order.display_id ?? null, customer_name: name || null, tickets } as Record<string, unknown>,
      },
      created.map((t) => t.id)
    )
  },
  async (ids, { container }) => {
    if (ids?.length) {
      await container.resolve<BookingModuleService>(BOOKING_MODULE).deleteBookingTickets(ids)
    }
  }
)

export const issueEventTicketsWorkflow = createWorkflow("issue-event-tickets", function (input: { order_id: string }) {
  const issued = issueTicketsStep(input)
  when("email-event-tickets", issued, (i) => !!i.email && !!i.data).then(() => {
    sendNotificationsStep(
      transform({ issued }, ({ issued }) => [
        {
          to: issued.email!,
          channel: "email",
          template: EVENT_TICKETS_TEMPLATE,
          data: issued.data!,
          idempotency_key: `event_tickets_${issued.order_id}`,
        },
      ])
    )
  })
  return new WorkflowResponse(issued)
})
