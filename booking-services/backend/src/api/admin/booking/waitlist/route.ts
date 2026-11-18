import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// GET /admin/booking/waitlist (TASKS P3-29 follow-up): who is waiting for
// which service and day (waiting or already told a time is free), soonest
// day first, with the customer's name and email.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "booking_waitlist",
    fields: ["id", "customer_id", "variant_id", "date", "status", "notified_at", "created_at"],
    filters: { status: ["waiting", "notified"] },
  })
  const variantIds = [...new Set(data.map((w) => w.variant_id))]
  const customerIds = [...new Set(data.map((w) => w.customer_id))]
  const [{ data: variants }, { data: customers }] = await Promise.all([
    variantIds.length
      ? query.graph({ entity: "product_variant", fields: ["id", "title", "product.title"], filters: { id: variantIds } })
      : Promise.resolve({ data: [] as { id: string; title: string; product?: { title: string } }[] }),
    customerIds.length
      ? query.graph({ entity: "customer", fields: ["id", "email", "first_name", "last_name"], filters: { id: customerIds } })
      : Promise.resolve({ data: [] as { id: string; email: string; first_name?: string | null; last_name?: string | null }[] }),
  ])
  res.json({
    waitlist: data
      .map((w) => {
        const v = variants.find((x) => x.id === w.variant_id)
        const c = customers.find((x) => x.id === w.customer_id)
        return {
          id: w.id,
          date: w.date,
          status: w.status,
          notified_at: w.notified_at,
          created_at: w.created_at,
          service: v ? `${v.product?.title ?? ""}${v.title && v.title !== v.product?.title ? ` (${v.title})` : ""}` : null,
          customer: c ? { email: c.email, name: [c.first_name, c.last_name].filter(Boolean).join(" ") || null } : null,
        }
      })
      .sort((a, b) => a.date.localeCompare(b.date) || new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
  })
}
