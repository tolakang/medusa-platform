import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { updateBookingResourceWorkflow } from "../../../../../workflows/booking-resource"
import type { PostProviderHoursType } from "../../../validators"
import { assertOwnResource, assertPartner, ownResources } from "../../own"

// POST /providers/me/resources/:id (TASKS P3-32): a partner replaces the
// weekly hours of one of their calendars. Nothing else of the resource can be
// changed here (name, capacity and services stay the shop's or the service
// routes').
export const POST = async (req: AuthenticatedMedusaRequest<PostProviderHoursType>, res: MedusaResponse) => {
  const providerId = req.auth_context.actor_id
  await assertPartner(req.scope, providerId)
  await assertOwnResource(req.scope, providerId, req.params.id)
  await updateBookingResourceWorkflow(req.scope).run({
    input: { id: req.params.id, schedules: req.validatedBody.schedules },
  })
  const resource = (await ownResources(req.scope, providerId)).find((r) => r.id === req.params.id)
  res.json({ resource })
}
