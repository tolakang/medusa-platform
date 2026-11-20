import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { createStep, createWorkflow, StepResponse, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { emitEventStep } from "@medusajs/medusa/core-flows"
import {
  movedEnd,
  moveDecision,
  MOVE_LENGTH_MESSAGE,
  MOVE_SAME_MESSAGE,
  MOVE_SERVICE_MESSAGE,
} from "../lib/booking-move"
import { BOOKING_MODULE } from "../modules/booking"
import type BookingModuleService from "../modules/booking/service"

// TASKS P3-28: move a booking. A customer reschedules their confirmed booking
// to another free time (any calendar offering the service) until the
// cancellation cutoff; staff assign it to another person, vehicle or item, or
// another time, until it ends. The length stays the same, so the price does
// too. The new place is locked and checked like a new hold; on a failure
// later in a workflow the booking goes back.

export type MoveBookingInput = {
  booking_id: string
  by: "customer" | "staff"
  // No customer email for this move (a whole event moved sends one, P3-30).
  quiet?: boolean
  // Set when the customer moves it: the booking must be theirs.
  customer_id?: string
  // The calendar to move to; default the booking's own.
  resource_id?: string | null
  // The new start; default the booking's own. The end keeps the length.
  starts_at?: string | null
  // When the customer picked a slot, its end: it must keep the length.
  ends_at?: string | null
}

// The undo also restores the reminder flag the move cleared (review finding).
type Before = { id: string; resource_id: string; starts_at: Date; ends_at: Date; reminder_sent_at: Date | null }

const moveBookingStep = createStep(
  "move-booking",
  async (input: MoveBookingInput, { container }) => {
    const service = container.resolve<BookingModuleService>(BOOKING_MODULE)
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const {
      data: [booking],
    } = await query.graph({
      entity: "booking",
      fields: ["id", "status", "starts_at", "ends_at", "reminder_sent_at", "customer_id", "resource.id", "resource.product_variants.id"],
      filters: { id: input.booking_id },
    })
    if (!booking || (input.customer_id !== undefined && booking.customer_id !== input.customer_id)) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Booking ${input.booking_id} was not found.`)
    }
    const now = new Date()
    const decision = moveDecision(booking, now, input.by, service.cancelHours)
    if (!decision.allowed) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, decision.message)
    }

    const resourceId = input.resource_id || booking.resource!.id
    const startsAt = input.starts_at ? new Date(input.starts_at) : new Date(booking.starts_at)
    const endsAt = movedEnd(booking, startsAt)
    if (input.ends_at && new Date(input.ends_at).getTime() !== endsAt.getTime()) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, MOVE_LENGTH_MESSAGE)
    }
    if (resourceId === booking.resource!.id && startsAt.getTime() === new Date(booking.starts_at).getTime()) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, MOVE_SAME_MESSAGE)
    }
    if (resourceId !== booking.resource!.id) {
      // The new calendar must offer the same service.
      const {
        data: [target],
      } = await query.graph({
        entity: "booking_resource",
        fields: ["id", "product_variants.id"],
        filters: { id: resourceId },
      })
      const offered = new Set((booking.resource!.product_variants ?? []).map((v) => v?.id))
      if (!target || !(target.product_variants ?? []).some((v) => offered.has(v?.id))) {
        throw new MedusaError(MedusaError.Types.INVALID_DATA, MOVE_SERVICE_MESSAGE)
      }
    }

    const before: Before = {
      id: booking.id,
      resource_id: booking.resource!.id,
      starts_at: new Date(booking.starts_at),
      ends_at: new Date(booking.ends_at),
      reminder_sent_at: booking.reminder_sent_at ? new Date(booking.reminder_sent_at) : null,
    }
    const moved = await service.moveBooking({ id: booking.id, resource_id: resourceId, starts_at: startsAt, ends_at: endsAt, now })
    return new StepResponse({ moved, before }, before)
  },
  async (before, { container }) => {
    if (before) {
      await container.resolve<BookingModuleService>(BOOKING_MODULE).updateBookings(before)
    }
  }
)

// After the move: the job to the calendars (and the customer's email when
// staff moved it) are sent by the booking.moved subscriber, so a message
// that fails never undoes the move.
export const BOOKING_MOVED_EVENT = "booking.moved"

export type BookingMovedData = {
  id: string
  by: "customer" | "staff"
  quiet?: boolean
  previous: { resource_id: string; starts_at: string; ends_at: string }
}

export const moveBookingWorkflow = createWorkflow("move-booking", function (input: MoveBookingInput) {
  const result = moveBookingStep(input)
  emitEventStep({
    eventName: BOOKING_MOVED_EVENT,
    data: transform({ result, input }, ({ result, input }): BookingMovedData => ({
      id: result.before.id,
      by: input.by,
      quiet: !!input.quiet,
      previous: {
        resource_id: result.before.resource_id,
        starts_at: new Date(result.before.starts_at).toISOString(),
        ends_at: new Date(result.before.ends_at).toISOString(),
      },
    })),
  })
  return new WorkflowResponse(transform({ result }, ({ result }) => result.moved))
})
