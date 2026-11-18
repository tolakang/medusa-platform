import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { freeSlotsForVariant } from "../../../../lib/variant-slots"
import { parseBookingQuery } from "../query"
import { GetBookingSlots } from "../validators"

// GET /store/booking/slots?variant_id=&date=YYYY-MM-DD[&resource_id=][&duration_minutes=]
// (duration defaults to the variant's metadata.duration_minutes, else 60)
// (TASKS P3-10): free slots for a service on a date, from every active
// resource that offers it (link P3-02), or one of them. Each slot carries its
// resource, so the storefront can add it with POST /store/booking/cart.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { variant_id, date, resource_id, duration_minutes } = parseBookingQuery(GetBookingSlots, req.query)
  const free = await freeSlotsForVariant(req.scope, { variant_id, date, resource_id, duration_minutes })
  res.json({ date, ...free })
}
