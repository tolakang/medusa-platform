import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { FULFILLMENT_FIELDS, isFullyFulfilled, remainingByItem } from "../../../lib/order-fulfillment"
import { parentStates } from "../../../workflows/marketplace/refund-review"

const GetAdminVendorOrders = z
  .object({
    vendor_id: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict()

// GET /admin/vendor-orders (TASKS P6-07): the vendors' child orders (the ones
// vendors fulfil and reports count), newest first, with their vendor and
// parent order. The admin's own order list shows parents and children
// together; this is the "child orders only" view (plan §9.6).
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const parsed = GetAdminVendorOrders.safeParse(req.query)
  if (!parsed.success) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, parsed.error.issues[0].message)
  }
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: vendors } = await query.graph({
    entity: "vendor",
    fields: ["id", "name", "orders.id"],
    filters: parsed.data.vendor_id ? { id: parsed.data.vendor_id } : {},
  })
  const vendorOf = new Map<string, { id: string; name: string }>()
  for (const v of vendors) {
    for (const o of v.orders ?? []) {
      vendorOf.set(o!.id, { id: v.id, name: v.name })
    }
  }
  if (!vendorOf.size) {
    return res.json({ orders: [], count: 0 })
  }
  const { limit, offset } = parsed.data
  const { data: orders, metadata } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "status",
      "total",
      "currency_code",
      "created_at",
      "metadata",
      ...FULFILLMENT_FIELDS,
    ],
    filters: { id: [...vendorOf.keys()] },
    pagination: { skip: offset, take: limit, order: { created_at: "DESC" } },
  })
  // Fulfilment and payment state (bug 2026-11-25: a fulfilled child showed
  // "Waiting", from order.status). Orders read through Query have no
  // fulfillment_status (MEDUSA_SKILL §6), so it's counted from fulfilments;
  // the payment is on the parent order.
  const parents = await parentStates(req.scope, orders.map((o) => o.id))
  res.json({
    orders: orders.map(({ metadata, items, fulfillments, ...o }) => {
      const row = { items, fulfillments }
      const sent = Object.values(remainingByItem(row))
      const parent = parents.get(o.id)
      return {
        ...o,
        fulfillment_status: isFullyFulfilled(row)
          ? "fulfilled"
          : sent.length && (fulfillments ?? []).some((f) => f && !f.canceled_at)
            ? "partially_fulfilled"
            : "not_fulfilled",
        payment_status: parent?.payment ?? null,
        parent_canceled: parent?.canceled ?? false,
        parent_display_id: parent?.parent_display_id ?? null,
        parent_order_id: (metadata?.parent_order_id as string | undefined) ?? null,
        vendor: vendorOf.get(o.id),
      }
    }),
    count: metadata?.count ?? orders.length,
    limit,
    offset,
  })
}
