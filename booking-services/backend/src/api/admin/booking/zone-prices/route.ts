import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { setTripZonePriceWorkflow } from "../../../../workflows/trip-zones"
import type { PostAdminZonePriceType } from "../validators"

// POST /admin/booking/zone-prices (TASKS P3-21): the price and length of a
// trip between two zones with one vehicle size (set or changed).
export const POST = async (req: MedusaRequest<PostAdminZonePriceType>, res: MedusaResponse) => {
  const { result } = await setTripZonePriceWorkflow(req.scope).run({ input: req.validatedBody })
  res.json({ price: result })
}
