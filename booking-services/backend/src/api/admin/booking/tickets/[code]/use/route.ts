import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { useEventTicketWorkflow } from "../../../../../../workflows/use-event-ticket"
import { ticketByCode } from "../route"

// POST /admin/booking/tickets/:code/use (TASKS P3-24): let the holder in. A
// ticket works once; a second scan is refused with when it was used.
export const POST = async (req: MedusaRequest, res: MedusaResponse) => {
  const ticket = await ticketByCode(req, req.params.code)
  await useEventTicketWorkflow(req.scope).run({ input: { id: ticket.id } })
  res.json({ ticket: await ticketByCode(req, req.params.code) })
}
