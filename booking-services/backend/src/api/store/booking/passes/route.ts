import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// GET /store/booking/passes (TASKS P3-29): the signed-in customer's passes,
// soonest to expire first, with the services each covers (handles).
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "booking_pass",
    fields: ["id", "title", "credits_total", "credits_left", "expires_at", "product_ids"],
    filters: { customer_id: req.auth_context.actor_id },
  })
  const ids = [...new Set(data.flatMap((p) => (Array.isArray(p.product_ids) ? (p.product_ids as string[]) : [])))]
  const { data: products } = ids.length
    ? await query.graph({ entity: "product", fields: ["id", "handle", "title"], filters: { id: ids } })
    : { data: [] }
  res.json({
    passes: data
      .map(({ product_ids, ...p }) => ({
        ...p,
        covers: products
          .filter((x) => (Array.isArray(product_ids) ? (product_ids as string[]) : []).includes(x.id))
          .map((x) => ({ handle: x.handle, title: x.title })),
      }))
      .sort((a, b) => new Date(a.expires_at).getTime() - new Date(b.expires_at).getTime()),
  })
}
