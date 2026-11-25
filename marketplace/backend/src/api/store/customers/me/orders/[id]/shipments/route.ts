import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import {
  CHILD_ORDERS_KEY,
  PARENT_ORDER_KEY,
} from "../../../../../../../workflows/marketplace/create-vendor-orders"

// GET /store/customers/me/orders/:id/shipments (role test leftovers): each
// vendor's shipments for one of the signed-in customer's orders, with the
// tracking number and link the vendor entered (POST /vendors/me/orders/:id/
// fulfillments). /store/customers/me* requires a signed-in customer
// (Medusa's built-in protection, MEDUSA_SKILL §API routes). The parent order
// must belong to that customer (else 404); child orders carry no customer_id
// (create-vendor-orders), so each must also point back at this parent.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [parent],
  } = await query.graph({
    entity: "order",
    fields: ["id", "customer_id", "metadata"],
    filters: { id: req.params.id },
  })
  if (!parent || !parent.customer_id || parent.customer_id !== req.auth_context.actor_id) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Order not found.")
  }
  const childIds = (parent.metadata?.[CHILD_ORDERS_KEY] ?? []) as string[]
  if (!childIds.length) {
    return res.json({ shipments: [] })
  }
  const { data: children } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "metadata",
      "vendor.name",
      "vendor.handle",
      "fulfillments.id",
      "fulfillments.created_at",
      "fulfillments.shipped_at",
      "fulfillments.delivered_at",
      "fulfillments.canceled_at",
      "fulfillments.labels.tracking_number",
      "fulfillments.labels.tracking_url",
    ],
    filters: { id: childIds },
  })
  res.json({
    shipments: children
      .filter((c) => c.metadata?.[PARENT_ORDER_KEY] === parent.id)
      .map((c) => ({
        vendor: c.vendor ? { name: c.vendor.name, handle: c.vendor.handle } : null,
        fulfillments: (c.fulfillments ?? [])
          .filter((f) => f && !f.canceled_at)
          .map((f) => ({
            id: f!.id,
            created_at: f!.created_at,
            shipped_at: f!.shipped_at,
            delivered_at: f!.delivered_at,
            labels: (f!.labels ?? [])
              .filter((l) => l?.tracking_number)
              .map((l) => ({
                tracking_number: l!.tracking_number,
                // Only http(s) links reach the page.
                tracking_url: /^https?:\/\//i.test(l!.tracking_url ?? "") ? l!.tracking_url : null,
              })),
          })),
      })),
  })
}
