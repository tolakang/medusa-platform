import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// GET /store/customers/me/bookings (TASKS P3-13, F-049): the signed-in
// customer's bookings for the account page, newest start first, with the
// resource and the order number. /store/customers/me* is customer-only in
// Medusa. Holds that ran out are left out. Guest checkouts with the same
// email are not merged in: Medusa doesn't verify a new account's email, so
// that would show a stranger's bookings (addresses) to anyone who signs up
// with their email.

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
      // The service's name for the list.
      "order.items.product_title",
      "order.items.variant_title",
      "order.currency_code",
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
          service: item ? [item.product_title, item.variant_title].filter(Boolean).join(" · ") : null,
          currency_code: order?.currency_code ?? null,
          order: order ? { id: order.id, display_id: order.display_id } : null,
        }
      }),
  })
}
