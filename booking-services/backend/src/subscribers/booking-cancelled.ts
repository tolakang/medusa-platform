import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { BOOKING_CANCELLED_TEMPLATE, type BookingCancelledEmailData } from "../lib/booking-cancel-email"
import { BOOKING_CANCELLED_EVENT, type BookingCancelledData } from "../workflows/cancel-booking"

// When staff (a provider or the shop) cancel a single paid booking, the
// customer is emailed with the refund, like a staff package cancel (P3-30
// follow-up). A customer's own cancel needs no email; a booking without an
// order (a hold, a walk-in) was never paid.
export default async function bookingCancelledHandler({ event: { data }, container }: SubscriberArgs<BookingCancelledData>) {
  if (data.by !== "staff") return
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [b],
  } = await query.graph({
    entity: "booking",
    fields: [
      "id",
      "starts_at",
      "customer_id",
      "resource.name",
      "resource.timezone",
      "order.id",
      "order.email",
      "order.currency_code",
      "order.items.product_title",
      "order.items.metadata",
    ],
    filters: { id: data.id },
  })
  if (!b?.order?.id || !b.resource) return
  const {
    data: [customer],
  } = b.customer_id
    ? await query.graph({ entity: "customer", fields: ["email", "first_name", "last_name"], filters: { id: b.customer_id } })
    : { data: [] as { email?: string; first_name?: string | null; last_name?: string | null }[] }
  const email = customer?.email || b.order.email
  if (!email) return
  const item = (b.order.items ?? []).find((i) => (i?.metadata as Record<string, unknown> | null)?.booking_id === b.id)
  const payload: BookingCancelledEmailData = {
    customer_name: [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || null,
    service: item?.product_title ?? null,
    calendar: b.resource.name,
    timezone: b.resource.timezone,
    starts_at: new Date(b.starts_at).toISOString(),
    refunded_amount: data.refunded_amount,
    currency_code: b.order.currency_code,
  }
  await container.resolve(Modules.NOTIFICATION).createNotifications({
    to: email,
    channel: "email",
    template: BOOKING_CANCELLED_TEMPLATE,
    data: payload,
    idempotency_key: `booking_cancelled_${b.id}`,
  })
}

export const config: SubscriberConfig = { event: BOOKING_CANCELLED_EVENT }
