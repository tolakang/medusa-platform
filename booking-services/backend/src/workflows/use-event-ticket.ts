import { MedusaError } from "@medusajs/framework/utils"
import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { BOOKING_MODULE } from "../modules/booking"
import type BookingModuleService from "../modules/booking/service"

// A ticket is used once, at the door (TASKS P3-24).
export const TICKET_USED_MESSAGE = "This ticket was already used"

const useTicketStep = createStep(
  "use-ticket",
  async (input: { id: string }, { container }) => {
    const booking = container.resolve<BookingModuleService>(BOOKING_MODULE)
    const ticket = await booking.retrieveBookingTicket(input.id)
    if (ticket.status === "used") {
      const at = ticket.used_at ? new Date(ticket.used_at).toISOString().replace("T", " ").slice(0, 16) : ""
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, `${TICKET_USED_MESSAGE}${at ? ` (${at} UTC)` : ""}.`)
    }
    await booking.updateBookingTickets({ id: ticket.id, status: "used", used_at: new Date() })
    return new StepResponse(ticket.id, ticket.id)
  },
  async (id, { container }) => {
    if (id) {
      await container.resolve<BookingModuleService>(BOOKING_MODULE).updateBookingTickets({ id, status: "valid", used_at: null })
    }
  }
)

export const useEventTicketWorkflow = createWorkflow("use-event-ticket", function (input: { id: string }) {
  return new WorkflowResponse(useTicketStep(input))
})
