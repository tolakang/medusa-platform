import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// The calendar's bookings overlapping a time window, with the customer and
// order (TASKS P3-11), shared by the admin (any resource) and a provider
// (their own resources only, P3-32). Holds that ran out are left out;
// cancelled and expired bookings are listed so the calendar can grey them.
export const BOOKING_FIELDS = [
  "id",
  "status",
  "starts_at",
  "ends_at",
  "hold_expires_at",
  "notes",
  "address",
  "dropoff_address",
  "customer_id",
  "resource.id",
  "resource.name",
  "resource.timezone",
  "order.id",
  "order.display_id",
]

export async function listCalendarBookings(
  scope: MedusaContainer,
  input: { resource_ids?: string[]; from: string; to: string }
) {
  if (input.resource_ids && !input.resource_ids.length) {
    return []
  }
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "booking",
    fields: BOOKING_FIELDS,
    filters: {
      ...(input.resource_ids ? { resource_id: input.resource_ids } : {}),
      starts_at: { $lt: new Date(input.to) },
      ends_at: { $gt: new Date(input.from) },
    },
    pagination: { order: { starts_at: "ASC" }, take: 500 },
  })
  const now = Date.now()
  const bookings = data.filter(
    (b) => !(b.status === "pending" && b.hold_expires_at && new Date(b.hold_expires_at).getTime() <= now)
  )
  const customerIds = [...new Set(bookings.map((b) => b.customer_id).filter((id): id is string => !!id))]
  const customers = new Map<string, { email: string | null; first_name: string | null; last_name: string | null }>()
  if (customerIds.length) {
    const { data: rows } = await query.graph({
      entity: "customer",
      fields: ["id", "email", "first_name", "last_name"],
      filters: { id: customerIds },
    })
    for (const c of rows) {
      customers.set(c.id, c)
    }
  }
  return bookings.map((b) => ({
    ...b,
    customer: b.customer_id ? customers.get(b.customer_id) ?? null : null,
  }))
}
