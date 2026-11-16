import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { removeBookingDayOffWorkflow } from "../../../../../../../workflows/provider-calendar"
import { assertOwnResource, assertPartner, ownResources } from "../../../../own"

// DELETE /providers/me/resources/:id/days-off/:date (TASKS P3-32): the day
// takes bookings again.
export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const providerId = req.auth_context.actor_id
  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.params.date)) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "The date must be YYYY-MM-DD.")
  }
  await assertPartner(req.scope, providerId)
  await assertOwnResource(req.scope, providerId, req.params.id)
  await removeBookingDayOffWorkflow(req.scope).run({
    input: { resource_id: req.params.id, date: req.params.date },
  })
  const resource = (await ownResources(req.scope, providerId)).find((r) => r.id === req.params.id)
  res.json({ resource })
}
