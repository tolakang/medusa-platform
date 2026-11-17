import { ContainerRegistrationKeys, MathBN, MedusaError, QueryContext } from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { addToCartWorkflow } from "@medusajs/medusa/core-flows"
import { BOOKING_MODULE } from "../modules/booking"
import type BookingModuleService from "../modules/booking/service"
import { hoursPrice, tripPricing, validHours, zonePriceBetween } from "../lib/trip-pricing"
import { rentalLabel, rentalPrice, rentalSpan, rentalUnit, rentalUnits } from "../lib/rental-pricing"
import { zonedTimeToUtc } from "../modules/booking/utils/slot"

// TASKS P3-04 (BUILD_PLAN §9.3): put a booked time slot in a cart. The hold
// and the line item are created together: if adding the line item fails, the
// hold is deleted again, and if a later step fails, the nested
// addToCartWorkflow removes the line item (docs "Execute Another Workflow").
// One line item per booking, quantity 1 (one booking = one place, F-045);
// the booking is found again from the item through metadata.booking_id.

export type AddBookingToCartInput = {
  cart_id: string
  variant_id: string
  resource_id: string
  // Not needed for a rental (P3-22): its dates set the times.
  starts_at?: string | Date
  ends_at?: string | Date
  notes?: string | null
  // For a visit at the customer's place (kind B, P3-20); a trip's pickup.
  address?: string | null
  // A trip (kind C, P3-21): drop-off, and hours or the two zones.
  dropoff_address?: string | null
  hours?: number | null
  from_zone_id?: string | null
  to_zone_id?: string | null
  // A rental (kind E, P3-22): "YYYY-MM-DD" dates; the times come from them.
  start_date?: string | null
  end_date?: string | null
}

// Line item metadata keys the later booking hooks read (P3-05, P3-07).
export const BOOKING_ITEM_METADATA = {
  booking_id: "booking_id",
  resource_id: "booking_resource_id",
  starts_at: "booking_starts_at",
  ends_at: "booking_ends_at",
  // For display in the cart, checkout and order (storefront, P3-13).
  resource_name: "booking_resource_name",
  timezone: "booking_timezone",
  // A visit's address (kind B, P3-20), shown with the item.
  address: "booking_address",
  // A trip (kind C, P3-21): drop-off and what was priced ("3 hours", "Town → Airport").
  dropoff_address: "booking_dropoff_address",
  trip: "booking_trip",
  // A rental (kind E, P3-22) is shown by its dates, not its times.
  whole_days: "booking_whole_days",
} as const

// A service done at the customer's place: its product has
// metadata.booking_kind "B" (set by the seed; in the admin, the product's
// Metadata).
export const VISIT_KIND = "B"
export const isVisitService = (product?: { metadata?: Record<string, unknown> | null } | null) =>
  product?.metadata?.booking_kind === VISIT_KIND
export const VISIT_ADDRESS_MIN = 5
export const VISIT_ADDRESS_MESSAGE = "Tell us the address for the visit."
export const VISIT_PROBLEM_MESSAGE = "Tell us what needs doing."
export const TRIP_ADDRESSES_MESSAGE = "Tell us the pickup and the drop-off address."
export const TRIP_HOURS_MESSAGE = "Choose how many hours you need the vehicle."
export const TRIP_ZONES_MESSAGE = "There is no price for a trip between these two areas with this vehicle."
export const RENTAL_DATES_MESSAGE = "Choose the start and end dates (up to 60 days)."
export const RENTAL_RESOURCE_MESSAGE = "This item isn't set up to be rented by the day."
export const TRIP_LENGTH_MESSAGE = "This time doesn't match the trip's length. Choose the time again."

type Prepared = {
  cart_id: string
  customer_id: string | null
  variant_id: string
  resource_id: string
  resource_name: string
  timezone: string
  // ISO strings: step outputs are serialized between steps, so a Date would
  // arrive in the next step as a string anyway.
  starts_at: string
  ends_at: string
  notes: string | null
  address: string | null
  dropoff_address: string | null
  // A trip's price, set by the backend (kind C, P3-21); null = the variant's.
  unit_price: number | null
  trip_label: string | null
  whole_days: boolean
}

// Checks before anything is written: the cart is open and the resource
// offers this service (link booking_resource ↔ product_variant, P3-02).
const prepareBookingStep = createStep(
  "prepare-booking",
  async (input: AddBookingToCartInput, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)

    const {
      data: [cart],
    } = await query.graph({
      entity: "cart",
      fields: ["id", "customer_id", "completed_at", "region_id", "currency_code"],
      filters: { id: input.cart_id },
    })
    if (!cart) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, `Cart ${input.cart_id} was not found.`)
    }
    if (cart.completed_at) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This cart is already checked out.")
    }

    const {
      data: [resource],
    } = await query.graph({
      entity: "booking_resource",
      fields: ["id", "name", "timezone", "is_active", "whole_days", "product_variants.id"],
      filters: { id: input.resource_id },
    })
    if (!resource) {
      throw new MedusaError(
        MedusaError.Types.NOT_FOUND,
        `Booking resource ${input.resource_id} was not found.`
      )
    }
    const offered = (resource.product_variants ?? []).some((v) => v?.id === input.variant_id)
    if (!offered) {
      throw new MedusaError(
        MedusaError.Types.NOT_ALLOWED,
        "This resource doesn't offer this service."
      )
    }

    // A visit at the customer's place (kind B, TASKS P3-20) needs to know
    // where to go and what needs doing.
    const {
      data: [variant],
    } = await query.graph({
      entity: "product_variant",
      fields: ["id", "product.metadata"],
      filters: { id: input.variant_id },
    })
    const visit = isVisitService(variant?.product)
    const address = visit ? (input.address ?? "").trim() : ""
    const notes = (input.notes ?? "").trim()
    if (visit && address.length < VISIT_ADDRESS_MIN) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, VISIT_ADDRESS_MESSAGE)
    }
    if (visit && !notes) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, VISIT_PROBLEM_MESSAGE)
    }

    // A trip (kind C, TASKS P3-21): both addresses, and the price and length
    // from its pricing mode, never from the request.
    const trip = tripPricing(variant?.product)
    const pickup = trip ? (input.address ?? "").trim() : ""
    const dropoff = trip ? (input.dropoff_address ?? "").trim() : ""
    let unit_price: number | null = null
    let trip_label: string | null = null
    let trip_minutes: number | null = null
    if (trip) {
      if (pickup.length < VISIT_ADDRESS_MIN || dropoff.length < VISIT_ADDRESS_MIN) {
        throw new MedusaError(MedusaError.Types.INVALID_DATA, TRIP_ADDRESSES_MESSAGE)
      }
      const { data: priced } = (await query.graph({
        entity: "product_variant",
        fields: ["id", "metadata", "calculated_price.calculated_amount"],
        filters: { id: input.variant_id },
        context: { calculated_price: QueryContext({ region_id: cart.region_id, currency_code: cart.currency_code }) },
      })) as unknown as { data: { metadata?: Record<string, unknown> | null; calculated_price?: { calculated_amount?: number | null } }[] }
      const vehicle = priced[0]
      if (trip === "hours") {
        const hours = validHours(input.hours, vehicle)
        const hourly = vehicle?.calculated_price?.calculated_amount
        if (hours === null || hourly == null) {
          throw new MedusaError(MedusaError.Types.INVALID_DATA, TRIP_HOURS_MESSAGE)
        }
        unit_price = hoursPrice(hourly, hours)
        trip_minutes = hours * 60
        trip_label = hours === 1 ? "1 hour" : `${hours} hours`
      } else {
        const booking = container.resolve<BookingModuleService>(BOOKING_MODULE)
        const rows = await booking.listBookingZonePrices(
          { variant_id: input.variant_id },
          { relations: ["from_zone", "to_zone"] }
        )
        const row = zonePriceBetween(
          rows.filter((r) => r.currency_code === cart.currency_code) as unknown as (typeof rows[number] & {
            from_zone_id: string
            to_zone_id: string
          })[],
          input.from_zone_id ?? "",
          input.to_zone_id ?? ""
        )
        if (!row) {
          throw new MedusaError(MedusaError.Types.INVALID_DATA, TRIP_ZONES_MESSAGE)
        }
        const name = (id: string | null | undefined) =>
          [row.from_zone, row.to_zone].find((z) => z?.id === id)?.name ?? ""
        unit_price = MathBN.convert(row.amount, 2).toNumber()
        trip_minutes = row.minutes
        trip_label = `${name(input.from_zone_id)} → ${name(input.to_zone_id)}`
      }
    }

    // A rental (kind E, TASKS P3-22): whole local days of an item booked by
    // days; the dates set the times, the count and the price.
    const rental = rentalUnit(variant?.product)
    let rentalTimes: { starts_at: string; ends_at: string } | null = null
    if (rental) {
      const units = rentalUnits(rental, input.start_date, input.end_date)
      if (units === null) {
        throw new MedusaError(MedusaError.Types.INVALID_DATA, RENTAL_DATES_MESSAGE)
      }
      // (The generated query types learn `whole_days` on the next dev run.)
      if (!(resource as { whole_days?: boolean }).whole_days) {
        throw new MedusaError(MedusaError.Types.NOT_ALLOWED, RENTAL_RESOURCE_MESSAGE)
      }
      const { data: priced } = (await query.graph({
        entity: "product_variant",
        fields: ["id", "calculated_price.calculated_amount"],
        filters: { id: input.variant_id },
        context: { calculated_price: QueryContext({ region_id: cart.region_id, currency_code: cart.currency_code }) },
      })) as unknown as { data: { calculated_price?: { calculated_amount?: number | null } }[] }
      const perUnit = priced[0]?.calculated_price?.calculated_amount
      if (perUnit == null) {
        throw new MedusaError(MedusaError.Types.INVALID_DATA, RENTAL_DATES_MESSAGE)
      }
      const span = rentalSpan(rental, input.start_date!, input.end_date!)
      rentalTimes = {
        starts_at: zonedTimeToUtc(span.from, "00:00", resource.timezone).toISOString(),
        ends_at: zonedTimeToUtc(span.to, "00:00", resource.timezone).toISOString(),
      }
      unit_price = rentalPrice(perUnit, units)
      trip_label = `${rentalLabel(rental, units)}: ${input.start_date} to ${input.end_date}`
    }

    const starts_at = new Date(rentalTimes?.starts_at ?? input.starts_at ?? "")
    const ends_at = new Date(rentalTimes?.ends_at ?? input.ends_at ?? "")
    if (Number.isNaN(starts_at.getTime()) || Number.isNaN(ends_at.getTime())) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "The booking times are not valid dates.")
    }
    if (trip_minutes !== null && ends_at.getTime() - starts_at.getTime() !== trip_minutes * 60_000) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, TRIP_LENGTH_MESSAGE)
    }

    const prepared: Prepared = {
      cart_id: cart.id,
      customer_id: cart.customer_id ?? null,
      variant_id: input.variant_id,
      resource_id: resource.id,
      resource_name: resource.name,
      timezone: resource.timezone,
      starts_at: starts_at.toISOString(),
      ends_at: ends_at.toISOString(),
      notes: notes || null,
      address: (trip ? pickup : address) || null,
      dropoff_address: dropoff || null,
      unit_price,
      trip_label,
      whole_days: !!rental,
    }
    return new StepResponse(prepared)
  }
)

// The hold (P3-03 createHold, row-locked). Compensation deletes it.
const createBookingHoldStep = createStep(
  "create-booking-hold",
  async (input: Prepared, { container }) => {
    const booking = container.resolve<BookingModuleService>(BOOKING_MODULE)
    const hold = await booking.createHold({
      resource_id: input.resource_id,
      starts_at: new Date(input.starts_at),
      ends_at: new Date(input.ends_at),
      cart_id: input.cart_id,
      customer_id: input.customer_id,
      notes: input.notes,
      address: input.address,
      dropoff_address: input.dropoff_address,
    })
    return new StepResponse(hold, hold.id)
  },
  async (holdId, { container }) => {
    if (!holdId) {
      return
    }
    await container.resolve<BookingModuleService>(BOOKING_MODULE).deleteBookings(holdId)
  }
)

// Finds the line item the nested addToCartWorkflow created (it returns
// nothing) and stores its id on the hold. Compensation clears it again.
const attachLineItemToHoldStep = createStep(
  "attach-line-item-to-hold",
  async (input: { cart_id: string; booking_id: string }, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const {
      data: [cart],
    } = await query.graph({
      entity: "cart",
      fields: ["id", "items.id", "items.metadata"],
      filters: { id: input.cart_id },
    })
    const item = (cart?.items ?? []).find(
      (i) => i?.metadata?.[BOOKING_ITEM_METADATA.booking_id] === input.booking_id
    )
    if (!item) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        "The booking's line item was not found in the cart."
      )
    }
    const booking = container.resolve<BookingModuleService>(BOOKING_MODULE)
    const updated = await booking.updateBookings({ id: input.booking_id, line_item_id: item.id })
    return new StepResponse({ booking: updated, line_item_id: item.id }, input.booking_id)
  },
  async (bookingId, { container }) => {
    if (!bookingId) {
      return
    }
    await container
      .resolve<BookingModuleService>(BOOKING_MODULE)
      .updateBookings({ id: bookingId, line_item_id: null })
  }
)

export const addBookingToCartWorkflow = createWorkflow(
  "add-booking-to-cart",
  function (input: AddBookingToCartInput) {
    const prepared = prepareBookingStep(input)
    const hold = createBookingHoldStep(prepared)

    const cartInput = transform({ prepared, hold }, ({ prepared, hold }) => ({
      cart_id: prepared.cart_id,
      items: [
        {
          variant_id: prepared.variant_id,
          quantity: 1,
          // A trip's price from its pricing mode (P3-21); kept by Medusa as a custom price.
          ...(prepared.unit_price !== null ? { unit_price: prepared.unit_price } : {}),
          metadata: {
            [BOOKING_ITEM_METADATA.booking_id]: hold.id,
            [BOOKING_ITEM_METADATA.resource_id]: prepared.resource_id,
            [BOOKING_ITEM_METADATA.starts_at]: prepared.starts_at,
            [BOOKING_ITEM_METADATA.ends_at]: prepared.ends_at,
            [BOOKING_ITEM_METADATA.resource_name]: prepared.resource_name,
            [BOOKING_ITEM_METADATA.timezone]: prepared.timezone,
            ...(prepared.address ? { [BOOKING_ITEM_METADATA.address]: prepared.address } : {}),
            ...(prepared.dropoff_address ? { [BOOKING_ITEM_METADATA.dropoff_address]: prepared.dropoff_address } : {}),
            ...(prepared.trip_label ? { [BOOKING_ITEM_METADATA.trip]: prepared.trip_label } : {}),
            ...(prepared.whole_days ? { [BOOKING_ITEM_METADATA.whole_days]: true } : {}),
          },
        },
      ],
    }))
    addToCartWorkflow.runAsStep({ input: cartInput })

    const attachInput = transform({ prepared, hold }, ({ prepared, hold }) => ({
      cart_id: prepared.cart_id,
      booking_id: hold.id,
    }))
    const result = attachLineItemToHoldStep(attachInput)

    return new WorkflowResponse(result)
  }
)
