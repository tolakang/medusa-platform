import { ContainerRegistrationKeys, MathBN, MedusaError } from "@medusajs/framework/utils"
import { createStep, createWorkflow, StepResponse, transform, when, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { sendNotificationsStep } from "@medusajs/medusa/core-flows"
import { EVENT_TICKETS_TEMPLATE, isEventProduct, ticketCode } from "../lib/event-tickets"
import { BOOKING_MODULE } from "../modules/booking"
import type BookingModuleService from "../modules/booking/service"

// Event tickets (kind F, TASKS P3-24): when an order is placed, one ticket
// with its own code per unit of each event line item, then one email with
// all of them. Run by the order.placed subscriber and again on
// payment.captured; idempotent: a line item that already has tickets is
// skipped, and the email has an idempotency key.
//
// The codes are emailed only once the order is paid (owner, 2026-11-25): a
// pay-later order gets its tickets when staff capture the payment, so an
// unpaid ticket can't be used at the door. Paid = captured covers the total
// (MEDUSA_SKILL §6, "What an order still owes").

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
        // A guest's name is on the checkout contact (billing address).
        "billing_address.first_name",
        "billing_address.last_name",
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
    if (!lines.length) {
      return new StepResponse({ order_id: order.id }, [] as string[])
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
      return new StepResponse({ order_id: order.id }, [] as string[])
    }
    const created = await booking.createBookingTickets(rows)
    return new StepResponse({ order_id: order.id }, created.map((t) => t.id))
  },
  async (ids, { container }) => {
    if (ids?.length) {
      await container.resolve<BookingModuleService>(BOOKING_MODULE).deleteBookingTickets(ids)
    }
  }
)

// The email for an order's tickets, or nothing while the order isn't paid.
const ticketEmailStep = createStep("event-tickets-email", async (input: { order_id: string }, { container }) => {
  const none = { email: null as string | null, data: null as Record<string, unknown> | null, order_id: input.order_id }
  const tickets = await container
    .resolve<BookingModuleService>(BOOKING_MODULE)
    .listBookingTickets({ order_id: input.order_id })
  if (!tickets.length) {
    return new StepResponse(none)
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [order],
  } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "email",
      "total",
      "payment_collections.captured_amount",
      "customer.first_name",
      "customer.last_name",
      "billing_address.first_name",
      "billing_address.last_name",
    ],
    filters: { id: input.order_id },
  })
  if (!order) {
    return new StepResponse(none)
  }
  const captured = (order.payment_collections ?? []).reduce(
    (sum, pc) => MathBN.add(sum, pc?.captured_amount ?? 0),
    MathBN.convert(0)
  )
  if (MathBN.lt(captured, order.total ?? 0)) {
    return new StepResponse(none)
  }
  const name =
    [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(" ") ||
    [order.billing_address?.first_name, order.billing_address?.last_name].filter(Boolean).join(" ")
  const issued: Issued[] = tickets.map((t) => ({ code: t.code, event_title: t.event_title, label: t.label }))
  return new StepResponse({
    email: order.email ?? null,
    order_id: order.id,
    data: { order_display_id: order.display_id ?? null, customer_name: name || null, tickets: issued } as Record<
      string,
      unknown
    >,
  })
})

export const issueEventTicketsWorkflow = createWorkflow("issue-event-tickets", function (input: { order_id: string }) {
  issueTicketsStep(input)
  const issued = ticketEmailStep(input)
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
