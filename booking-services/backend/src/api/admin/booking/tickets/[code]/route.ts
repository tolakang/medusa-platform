import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { normalizeTicketCode } from "../../../../../lib/event-tickets"

export const TICKET_FIELDS = ["id", "code", "order_id", "event_title", "label", "event_starts_at", "status", "used_at"]

export async function ticketByCode(req: MedusaRequest, raw: string) {
  const code = normalizeTicketCode(raw)
  const { data } = code
    ? await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
        entity: "booking_ticket",
        fields: TICKET_FIELDS,
        filters: { code },
      })
    : { data: [] }
  if (!data[0]) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "No ticket with this code.")
  }
  return data[0]
}

// GET /admin/booking/tickets/:code (TASKS P3-24): look a ticket up at the
// door, however the code is typed.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  res.json({ ticket: await ticketByCode(req, req.params.code) })
}
