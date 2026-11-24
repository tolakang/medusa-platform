import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { closePosShiftWorkflow } from "../../../../../../workflows/pos-shift"
import type { PostAdminPosShiftCloseType } from "../../../../../pos/validators"

// POST /admin/pos/shifts/:id/close (gap review 2026-11-24): an admin closes a
// shift the cashier left open (one open shift per register blocks the next
// cashier). Same workflow as the cashier's close; closed_by is the admin.
export const POST = async (req: AuthenticatedMedusaRequest<PostAdminPosShiftCloseType>, res: MedusaResponse) => {
  const { counted_cash, notes } = req.validatedBody
  const { result } = await closePosShiftWorkflow(req.scope).run({
    input: {
      shift_id: req.params.id,
      counted_cash,
      notes: notes ?? "Closed by an admin.",
      cashier_id: req.auth_context.actor_id,
    },
  })
  res.json(result)
}
