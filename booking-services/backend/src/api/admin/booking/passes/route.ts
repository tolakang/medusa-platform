import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// GET /admin/booking/passes (TASKS P3-29 follow-up): customers' passes,
// soonest to expire first: credits left of the total, until when, the
// customer and the order it came from (at most 500).
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "booking_pass",
    fields: ["id", "title", "customer_id", "order_id", "credits_total", "credits_left", "expires_at", "created_at"],
    pagination: { order: { expires_at: "ASC" }, take: 500 },
  })
  const customerIds = [...new Set(data.map((p) => p.customer_id))]
  const orderIds = [...new Set(data.map((p) => p.order_id))]
  const [{ data: customers }, { data: orders }] = await Promise.all([
    customerIds.length
      ? query.graph({ entity: "customer", fields: ["id", "email", "first_name", "last_name"], filters: { id: customerIds } })
      : Promise.resolve({ data: [] as { id: string; email: string; first_name?: string | null; last_name?: string | null }[] }),
    orderIds.length
      ? query.graph({ entity: "order", fields: ["id", "display_id"], filters: { id: orderIds } })
      : Promise.resolve({ data: [] as { id: string; display_id: number }[] }),
  ])
  res.json({
    passes: data.map((p) => {
      const c = customers.find((x) => x.id === p.customer_id)
      return {
        id: p.id,
        title: p.title,
        credits_total: p.credits_total,
        credits_left: p.credits_left,
        expires_at: p.expires_at,
        order_display_id: orders.find((o) => o.id === p.order_id)?.display_id ?? null,
        customer: c ? { email: c.email, name: [c.first_name, c.last_name].filter(Boolean).join(" ") || null } : null,
      }
    }),
  })
}
