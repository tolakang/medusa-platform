import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"

// GET /store/booking/zones?variant_id= (TASKS P3-21): for a zone-priced trip,
// the zones it runs between and each pair's price and length, so the
// storefront can show the price before booking. The cart sets the price
// again from the same table.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const variantId = typeof req.query.variant_id === "string" ? req.query.variant_id : ""
  if (!variantId) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "variant_id is required.")
  }
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: prices } = await query.graph({
    entity: "booking_zone_price",
    fields: ["from_zone_id", "to_zone_id", "amount", "currency_code", "minutes"],
    filters: { variant_id: variantId },
  })
  const ids = [...new Set(prices.flatMap((p) => [p.from_zone_id, p.to_zone_id]))]
  const { data: zones } = ids.length
    ? await query.graph({
        entity: "booking_zone",
        fields: ["id", "name", "rank"],
        filters: { id: ids },
        pagination: { order: { rank: "ASC", name: "ASC" } },
      })
    : { data: [] }
  res.json({ zones, prices: prices.map((p) => ({ ...p, amount: Number(p.amount) })) })
}
