import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { deleteTripZonePriceWorkflow } from "../../../../../workflows/trip-zones"

// DELETE /admin/booking/zone-prices/:id (TASKS P3-21).
export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
  await deleteTripZonePriceWorkflow(req.scope).run({ input: { id: req.params.id } })
  res.json({ id: req.params.id, deleted: true })
}
