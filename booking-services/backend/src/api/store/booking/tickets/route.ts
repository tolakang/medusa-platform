import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"

// GET /store/booking/tickets?order_id= (TASKS P3-24): an order's event
// tickets with their codes, for the order page. Reachable as the order page
// itself is (by the order's id).
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const orderId = typeof req.query.order_id === "string" ? req.query.order_id : ""
  if (!/^order_[A-Za-z0-9]+$/.test(orderId)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "order_id is required.")
  }
  const { data } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "booking_ticket",
    fields: ["code", "line_item_id", "event_title", "label", "event_starts_at", "status"],
    filters: { order_id: orderId },
    pagination: { order: { created_at: "ASC" } },
  })
  res.json({ tickets: data })
}
