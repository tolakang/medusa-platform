import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { createWalkInBookingWorkflow } from "../../../../workflows/create-walk-in-booking"
import { listCalendarBookings } from "../../../booking-calendar"
import { parseBookingQuery } from "../../../store/booking/query"
import { GetProviderBookings, type PostProviderWalkInType } from "../../validators"
import { assertOwnResource, ownResourceIds } from "../own"

// GET /providers/me/bookings?from=&to=[&resource_id=] (TASKS P3-32): the
// bookings on the provider's own calendars in a time window, as the admin
// calendar shows them.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { resource_id, from, to } = parseBookingQuery(GetProviderBookings, req.query)
  const own = await ownResourceIds(req.scope, req.auth_context.actor_id)
  if (resource_id) {
    await assertOwnResource(req.scope, req.auth_context.actor_id, resource_id)
  }
  res.json({
    bookings: await listCalendarBookings(req.scope, { resource_ids: resource_id ? [resource_id] : own, from, to }),
  })
}

// POST /providers/me/bookings: a walk-in on one of their own calendars
// (confirmed at once, inside the opening hours and capacity).
export const POST = async (req: AuthenticatedMedusaRequest<PostProviderWalkInType>, res: MedusaResponse) => {
  await assertOwnResource(req.scope, req.auth_context.actor_id, req.validatedBody.resource_id)
  const { result } = await createWalkInBookingWorkflow(req.scope).run({ input: req.validatedBody })
  res.status(201).json({ booking: result })
}
