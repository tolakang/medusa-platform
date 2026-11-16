import { MedusaError } from "@medusajs/framework/utils"
import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { BOOKING_MODULE } from "../modules/booking"
import type BookingModuleService from "../modules/booking/service"

// Days off (TASKS P3-32, plan §9.3 "hours and days off"): a partner closes
// one of their calendars for a date (local to the calendar's time zone).
// Whose calendar it is, is checked by the route (api/providers/me/own.ts).

export const DAY_OFF_EXISTS_MESSAGE = "This day is already a day off."

type DayOffInput = { resource_id: string; date: string }

const addDayOffStep = createStep(
  "add-day-off",
  async (input: DayOffInput, { container }) => {
    const booking = container.resolve<BookingModuleService>(BOOKING_MODULE)
    const [existing] = await booking.listBookingDayOffs(input)
    if (existing) {
      throw new MedusaError(MedusaError.Types.DUPLICATE_ERROR, DAY_OFF_EXISTS_MESSAGE)
    }
    const dayOff = await booking.createBookingDayOffs(input)
    return new StepResponse(dayOff, dayOff.id)
  },
  async (id, { container }) => {
    if (id) {
      await container.resolve<BookingModuleService>(BOOKING_MODULE).deleteBookingDayOffs(id)
    }
  }
)

export const addBookingDayOffWorkflow = createWorkflow("add-booking-day-off", function (input: DayOffInput) {
  return new WorkflowResponse(addDayOffStep(input))
})

const removeDayOffStep = createStep(
  "remove-day-off",
  async (input: DayOffInput, { container }) => {
    const booking = container.resolve<BookingModuleService>(BOOKING_MODULE)
    const rows = await booking.listBookingDayOffs(input)
    if (rows.length) {
      await booking.deleteBookingDayOffs(rows.map((r) => r.id))
    }
    return new StepResponse({ removed: rows.length }, rows.length ? input : null)
  },
  async (input, { container }) => {
    if (input) {
      await container.resolve<BookingModuleService>(BOOKING_MODULE).createBookingDayOffs(input)
    }
  }
)

export const removeBookingDayOffWorkflow = createWorkflow("remove-booking-day-off", function (input: DayOffInput) {
  return new WorkflowResponse(removeDayOffStep(input))
})
