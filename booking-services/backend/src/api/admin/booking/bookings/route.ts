import type { AuthenticatedMedusaRequest, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { listCalendarBookings } from "../../../booking-calendar"
import { createWalkInBookingWorkflow } from "../../../../workflows/create-walk-in-booking"
import { parseBookingQuery } from "../../../store/booking/query"
import { GetAdminBookings, type PostAdminWalkInType } from "../validators"

// GET /admin/booking/bookings?from=&to=[&resource_id=] (TASKS P3-11): the
// calendar's bookings overlapping a time window (a day or a week), with the
// customer and order. Holds that ran out are left out; cancelled and expired
// bookings are listed so the calendar can show them greyed out.
// POST /admin/booking/bookings: a walk-in booking (confirmed at the counter).
// The listing itself is in api/booking-calendar.ts (shared with providers).
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { resource_id, from, to } = parseBookingQuery(GetAdminBookings, req.query)
  res.json({
    bookings: await listCalendarBookings(req.scope, {
      ...(resource_id ? { resource_ids: [resource_id] } : {}),
      from,
      to,
    }),
  })
}

export const POST = async (req: AuthenticatedMedusaRequest<PostAdminWalkInType>, res: MedusaResponse) => {
  const { result } = await createWalkInBookingWorkflow(req.scope).run({ input: req.validatedBody })
  res.status(201).json({ booking: result })
}
