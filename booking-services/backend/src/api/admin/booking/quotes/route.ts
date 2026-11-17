import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { listQuotes } from "../../../booking-quotes"

// GET /admin/booking/quotes?status= (TASKS P3-27): quotes to price and follow.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const status = typeof req.query.status === "string" && req.query.status ? req.query.status : undefined
  const quotes = await listQuotes(req.scope, status && status !== "expired" ? { status } : {})
  const { data: customers } = quotes.length
    ? await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
        entity: "customer",
        fields: ["id", "email", "first_name", "last_name"],
        filters: { id: [...new Set(quotes.map((q) => q.customer_id))] },
      })
    : { data: [] }
  const byId = new Map((customers as { id: string; email: string; first_name?: string | null; last_name?: string | null }[]).map((c) => [c.id, c]))
  res.json({
    quotes: quotes
      .filter((q) => !status || q.status === status)
      .map((q) => {
        const c = byId.get(q.customer_id)
        return { ...q, customer: c ? { email: c.email, name: [c.first_name, c.last_name].filter(Boolean).join(" ") || null } : null }
      }),
  })
}
