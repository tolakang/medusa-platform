import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// GET /admin/booking/reviews (TASKS P3-29): every review, newest first, with
// the service's title (at most 200).
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "booking_review",
    fields: ["id", "booking_id", "product_id", "rating", "comment", "author", "status", "created_at"],
    pagination: { order: { created_at: "DESC" }, take: 200 },
  })
  const ids = [...new Set(data.map((r) => r.product_id))]
  const { data: products } = ids.length
    ? await query.graph({ entity: "product", fields: ["id", "title"], filters: { id: ids } })
    : { data: [] }
  const titles = new Map(products.map((p) => [p.id, p.title]))
  res.json({ reviews: data.map((r) => ({ ...r, service: titles.get(r.product_id) ?? null })) })
}
