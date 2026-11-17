import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { moveBookingWorkflow } from "../../../../../../workflows/move-booking"
import type { PostAdminBookingMoveType } from "../../../validators"

// POST /admin/booking/bookings/:id/move { resource_id?, starts_at? } (TASKS
// P3-28): staff assign the booking to another person, vehicle or item, or
// another time; the length stays the same.
export const POST = async (req: MedusaRequest<PostAdminBookingMoveType>, res: MedusaResponse) => {
  const { result } = await moveBookingWorkflow(req.scope).run({
    input: { ...req.validatedBody, booking_id: req.params.id, by: "staff" },
  })
  res.json({ booking: { id: result.id, status: result.status, starts_at: result.starts_at, ends_at: result.ends_at } })
}
