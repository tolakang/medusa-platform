import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// GET /store/customers/me/bookings (TASKS P3-13, F-049): the signed-in
// customer's bookings for the account page, newest start first, with the
// resource and the order number. /store/customers/me* is customer-only in
// Medusa. Holds that ran out are left out.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "booking",
    fields: [
      "id",
      "status",
      "starts_at",
      "ends_at",
      "notes",
      "address",
      "dropoff_address",
      "seats",
      "series_id",
      "package_id",
      "hold_expires_at",
      "resource.id",
      "resource.name",
      "resource.timezone",
      "order.id",
      "order.display_id",
      // The service, for rescheduling (P3-28): the order line of this booking.
      "order.items.variant_id",
      "order.items.product_id",
      "order.items.metadata",
    ],
    filters: { customer_id: req.auth_context.actor_id },
    pagination: { order: { starts_at: "DESC" }, take: 100 },
  })
  // Which of them the customer reviewed (P3-29).
  const { data: reviews } = data.length
    ? await query.graph({ entity: "booking_review", fields: ["booking_id"], filters: { booking_id: data.map((b) => b.id) } })
    : { data: [] }
  const reviewed = new Set(reviews.map((r) => r.booking_id))
  const now = Date.now()
  res.json({
    bookings: data
      .filter((b) => !(b.status === "pending" && b.hold_expires_at && new Date(b.hold_expires_at).getTime() <= now))
      .map(({ hold_expires_at: _hold, order, ...b }) => {
        const item = (order?.items ?? []).find((i) => (i?.metadata as Record<string, unknown> | null)?.booking_id === b.id)
        return {
          ...b,
          variant_id: item?.variant_id ?? null,
          product_id: item?.product_id ?? null,
          reviewed: reviewed.has(b.id),
          order: order ? { id: order.id, display_id: order.display_id } : null,
        }
      }),
  })
}
