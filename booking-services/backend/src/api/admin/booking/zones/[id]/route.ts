import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { deleteTripZoneWorkflow } from "../../../../../workflows/trip-zones"

// DELETE /admin/booking/zones/:id (TASKS P3-21): the zone and its prices.
export const DELETE = async (req: MedusaRequest, res: MedusaResponse) => {
  await deleteTripZoneWorkflow(req.scope).run({ input: { id: req.params.id } })
  res.json({ id: req.params.id, deleted: true })
}
