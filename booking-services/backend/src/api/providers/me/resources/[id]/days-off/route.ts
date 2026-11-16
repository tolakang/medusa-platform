import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { addBookingDayOffWorkflow } from "../../../../../../workflows/provider-calendar"
import type { PostProviderDayOffType } from "../../../../validators"
import { assertOwnResource, assertPartner, ownResources } from "../../../own"

// POST /providers/me/resources/:id/days-off (TASKS P3-32): a partner closes
// one of their calendars for a date. Bookings already made that day stay.
export const POST = async (req: AuthenticatedMedusaRequest<PostProviderDayOffType>, res: MedusaResponse) => {
  const providerId = req.auth_context.actor_id
  await assertPartner(req.scope, providerId)
  await assertOwnResource(req.scope, providerId, req.params.id)
  await addBookingDayOffWorkflow(req.scope).run({
    input: { resource_id: req.params.id, date: req.validatedBody.date },
  })
  const resource = (await ownResources(req.scope, providerId)).find((r) => r.id === req.params.id)
  res.status(201).json({ resource })
}
