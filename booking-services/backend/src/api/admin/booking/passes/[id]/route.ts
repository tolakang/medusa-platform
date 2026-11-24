import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { BOOKING_MODULE } from "../../../../../modules/booking"
import type BookingModuleService from "../../../../../modules/booking/service"
import type { PostAdminPassType } from "../../validators"

// POST /admin/booking/passes/:id (gap review 2026-11-24): give back or take
// away credits (never above the total), or end the pass now.
export const POST = async (req: MedusaRequest<PostAdminPassType>, res: MedusaResponse) => {
  const service = req.scope.resolve<BookingModuleService>(BOOKING_MODULE)
  const pass = await service.retrieveBookingPass(req.params.id)
  const { credits_left, expires_at } = req.validatedBody
  if (credits_left !== undefined && credits_left > pass.credits_total) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, `A pass has at most ${pass.credits_total} credits.`)
  }
  const updated = await service.updateBookingPasses({
    id: pass.id,
    ...(credits_left !== undefined ? { credits_left } : {}),
    ...(expires_at !== undefined ? { expires_at: expires_at === "now" ? new Date() : new Date(expires_at) } : {}),
  })
  res.json({ pass: { id: updated.id, credits_left: updated.credits_left, credits_total: updated.credits_total, expires_at: updated.expires_at } })
}
