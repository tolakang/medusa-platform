import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { sellerChannelId } from "../../seller-catalog"

// GET /sellers/me/orders (plan §9.5 portal "sales", TASKS P5-08): orders
// placed in the seller's channel, newest first, with each one's commission.
// No customer details: the shop fulfils the order and keeps the customer.
const Query = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict()

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const parsed = Query.safeParse(req.query)
  if (!parsed.success) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")
    )
  }
  const { limit, offset } = parsed.data
  const channelId = await sellerChannelId(req.scope, req.auth_context.actor_id)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)

  const { data: orders, metadata } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "created_at",
      "status",
      "currency_code",
      "total",
      "payment_collections.captured_amount",
      "payment_collections.refunded_amount",
      "items.title",
      "items.quantity",
    ],
    filters: { sales_channel_id: channelId, is_draft_order: false },
    pagination: { skip: offset, take: limit, order: { created_at: "DESC" } },
  })

  const { data: commissions } = orders.length
    ? await query.graph({
        entity: "seller_commission",
        fields: ["order_id", "amount", "status", "refunded_total"],
        filters: {
          order_id: orders.map((order) => order.id),
          seller_id: req.auth_context.actor_id,
        },
      })
    : { data: [] }
  const byOrder = new Map(commissions.map((c) => [c.order_id, c]))

  res.json({
    orders: orders.map((order) => ({
      id: order.id,
      display_id: order.display_id,
      created_at: order.created_at,
      status: order.status,
      currency_code: order.currency_code,
      total: order.total,
      // What the customer paid and got back. `total` goes down with refunds
      // (verified 2.22.6), so the portal shows these instead.
      paid_total: (order.payment_collections ?? []).reduce(
        (sum, c) => sum + Number(c?.captured_amount ?? 0),
        0
      ),
      refunded_total: (order.payment_collections ?? []).reduce(
        (sum, c) => sum + Number(c?.refunded_amount ?? 0),
        0
      ),
      items: (order.items ?? []).filter(Boolean).map((item) => ({
        title: item!.title,
        quantity: item!.quantity,
      })),
      commission: byOrder.get(order.id)
        ? { amount: byOrder.get(order.id)!.amount, status: byOrder.get(order.id)!.status }
        : null,
    })),
    count: metadata?.count ?? orders.length,
    limit,
    offset,
  })
}
