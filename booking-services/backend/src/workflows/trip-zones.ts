import { MedusaError } from "@medusajs/framework/utils"
import { createStep, createWorkflow, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { BOOKING_MODULE } from "../modules/booking"
import type BookingModuleService from "../modules/booking/service"

// Zones and their price table for zone-priced trips (kind C, TASKS P3-21,
// plan D12). Used by the admin's Trip zones page.

const service = (c: { resolve: (k: string) => unknown }) => c.resolve(BOOKING_MODULE) as BookingModuleService

export const ZONE_NAME_TAKEN_MESSAGE = "A zone with this name already exists."
export const SAME_ZONE_MESSAGE = "Choose two different zones."

const createZoneStep = createStep(
  "create-zone",
  async (input: { name: string; rank?: number }, { container }) => {
    const booking = service(container)
    const name = input.name.trim()
    if ((await booking.listBookingZones({ name })).length) {
      throw new MedusaError(MedusaError.Types.DUPLICATE_ERROR, ZONE_NAME_TAKEN_MESSAGE)
    }
    const zone = await booking.createBookingZones({ name, rank: input.rank ?? 0 })
    return new StepResponse(zone, zone.id)
  },
  async (id, { container }) => {
    if (id) await service(container).deleteBookingZones(id)
  }
)

export const createTripZoneWorkflow = createWorkflow("create-trip-zone", function (input: { name: string; rank?: number }) {
  return new WorkflowResponse(createZoneStep(input))
})

// A zone goes with its prices (soft delete, so it can be restored).
const deleteZoneStep = createStep(
  "delete-zone",
  async (id: string, { container }) => {
    const booking = service(container)
    const prices = [
      ...(await booking.listBookingZonePrices({ from_zone_id: id })),
      ...(await booking.listBookingZonePrices({ to_zone_id: id })),
    ].map((p) => p.id)
    if (prices.length) await booking.softDeleteBookingZonePrices(prices)
    await booking.softDeleteBookingZones(id)
    return new StepResponse(id, { id, prices })
  },
  async (deleted, { container }) => {
    if (!deleted) return
    const booking = service(container)
    await booking.restoreBookingZones(deleted.id)
    if (deleted.prices.length) await booking.restoreBookingZonePrices(deleted.prices)
  }
)

export const deleteTripZoneWorkflow = createWorkflow("delete-trip-zone", function (input: { id: string }) {
  return new WorkflowResponse(deleteZoneStep(input.id))
})

type ZonePriceUndo = {
  before: { id: string; amount: number; minutes: number; currency_code: string } | null
  created: string | null
}

export type ZonePriceInput = {
  variant_id: string
  from_zone_id: string
  to_zone_id: string
  amount: number
  minutes: number
  currency_code: string
}

// Sets the price between two zones for a vehicle size: one row per pair, in
// either direction (an existing row for the pair is updated).
const setZonePriceStep = createStep(
  "set-zone-price",
  async (input: ZonePriceInput, { container }) => {
    if (input.from_zone_id === input.to_zone_id) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, SAME_ZONE_MESSAGE)
    }
    const booking = service(container)
    const existing = [
      ...(await booking.listBookingZonePrices({ variant_id: input.variant_id, from_zone_id: input.from_zone_id, to_zone_id: input.to_zone_id })),
      ...(await booking.listBookingZonePrices({ variant_id: input.variant_id, from_zone_id: input.to_zone_id, to_zone_id: input.from_zone_id })),
    ][0]
    if (existing) {
      const before = { id: existing.id, amount: Number(existing.amount), minutes: existing.minutes, currency_code: existing.currency_code }
      const row = await booking.updateBookingZonePrices({
        id: existing.id,
        amount: input.amount,
        minutes: input.minutes,
        currency_code: input.currency_code,
      })
      return new StepResponse(row, { before, created: null } as ZonePriceUndo)
    }
    const row = await booking.createBookingZonePrices(input)
    return new StepResponse(row, { before: null, created: row.id } as ZonePriceUndo)
  },
  async (undo: ZonePriceUndo | undefined, { container }) => {
    if (!undo) return
    const booking = service(container)
    if (undo.created) await booking.deleteBookingZonePrices(undo.created)
    if (undo.before) await booking.updateBookingZonePrices(undo.before)
  }
)

export const setTripZonePriceWorkflow = createWorkflow("set-trip-zone-price", function (input: ZonePriceInput) {
  return new WorkflowResponse(setZonePriceStep(input))
})

const deleteZonePriceStep = createStep(
  "delete-zone-price",
  async (id: string, { container }) => {
    await service(container).softDeleteBookingZonePrices(id)
    return new StepResponse(id, id)
  },
  async (id, { container }) => {
    if (id) await service(container).restoreBookingZonePrices(id)
  }
)

export const deleteTripZonePriceWorkflow = createWorkflow("delete-trip-zone-price", function (input: { id: string }) {
  return new WorkflowResponse(deleteZonePriceStep(input.id))
})
