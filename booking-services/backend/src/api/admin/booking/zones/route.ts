import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createTripZoneWorkflow } from "../../../../workflows/trip-zones"
import type { PostAdminZoneType } from "../validators"

// GET/POST /admin/booking/zones (TASKS P3-21): areas for zone-priced trips,
// with their price table.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: zones } = await query.graph({
    entity: "booking_zone",
    fields: ["id", "name", "rank"],
    pagination: { order: { rank: "ASC", name: "ASC" } },
  })
  const { data: prices } = await query.graph({
    entity: "booking_zone_price",
    fields: ["id", "variant_id", "from_zone_id", "to_zone_id", "amount", "currency_code", "minutes"],
  })
  res.json({ zones, prices })
}

export const POST = async (req: MedusaRequest<PostAdminZoneType>, res: MedusaResponse) => {
  const { result } = await createTripZoneWorkflow(req.scope).run({ input: req.validatedBody })
  res.status(201).json({ zone: result })
}
