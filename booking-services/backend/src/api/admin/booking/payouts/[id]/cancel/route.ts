import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { BOOKING_MODULE } from "../../../../../../modules/booking"
import type BookingModuleService from "../../../../../../modules/booking/service"
import { cancelProviderPayoutWorkflow } from "../../../../../../workflows/provider-commission"

// POST /admin/booking/payouts/:id/cancel (gap review 2026-11-24): cancel a
// pending payout made by mistake.
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  await req.scope.resolve<BookingModuleService>(BOOKING_MODULE).retrieveBookingPayout(req.params.id)
  await cancelProviderPayoutWorkflow(req.scope).run({ input: { id: req.params.id } })
  res.json({ id: req.params.id, status: "cancelled" })
}
