import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { BOOKING_MOVED_TEMPLATE, type BookingMovedEmailData } from "../lib/booking-move"
import { BOOKING_MOVED_EVENT, type BookingMovedData } from "../workflows/move-booking"
import { sendBookingJobsWorkflow } from "../workflows/send-booking-jobs"

// TASKS P3-28: after a move, the job goes to the calendar it's on now (and
// the old one hears it's gone); when staff moved it, the customer is emailed.
export default async function bookingMovedHandler({ event: { data }, container }: SubscriberArgs<BookingMovedData>) {
  await sendBookingJobsWorkflow(container).run({
    input: { jobs: [{ booking_id: data.id, kind: "moved", previous: data.previous }] },
  })
  if (data.by !== "staff") return

  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [b],
  } = await query.graph({
    entity: "booking",
    fields: ["id", "starts_at", "ends_at", "customer_id", "resource.name", "resource.timezone", "order.email", "order.items.product_title", "order.items.metadata"],
    filters: { id: data.id },
  })
  if (!b?.resource) return
  const {
    data: [customer],
  } = b.customer_id
    ? await query.graph({ entity: "customer", fields: ["email", "first_name", "last_name"], filters: { id: b.customer_id } })
    : { data: [] as { email?: string; first_name?: string | null; last_name?: string | null }[] }
  const email = customer?.email || b.order?.email
  if (!email) return
  const item = (b.order?.items ?? []).find((i) => (i?.metadata as Record<string, unknown> | null)?.booking_id === b.id)
  const starts = new Date(b.starts_at).toISOString()
  const payload: BookingMovedEmailData = {
    customer_name: [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || null,
    service: item?.product_title ?? null,
    calendar: b.resource.name,
    timezone: b.resource.timezone,
    starts_at: starts,
    ends_at: new Date(b.ends_at).toISOString(),
    previous_starts_at: data.previous.starts_at,
  }
  await container.resolve(Modules.NOTIFICATION).createNotifications({
    to: email,
    channel: "email",
    template: BOOKING_MOVED_TEMPLATE,
    data: payload,
    idempotency_key: `booking_moved_${b.id}_${starts}`,
  })
}

export const config: SubscriberConfig = { event: BOOKING_MOVED_EVENT }
