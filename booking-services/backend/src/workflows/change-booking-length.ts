import { ContainerRegistrationKeys, MathBN, MedusaError, Modules, QueryContext } from "@medusajs/framework/utils"
import { createStep, createWorkflow, StepResponse, transform, when, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { createPaymentCollectionsStep, createRemoteLinkStep, emitEventStep, refundPaymentWorkflow } from "@medusajs/medusa/core-flows"
import { bookingIdOf } from "../lib/booking-cart-rules"
import { CHANGE_FREE_MESSAGE, CHANGE_NOT_ALLOWED_MESSAGE, CHANGE_SAME_MESSAGE, priceChange } from "../lib/change-length"
import { BALANCE_METADATA_KEY } from "../lib/deposits"
import { PACKAGE_ITEM_KEY } from "../lib/packages"
import { PASS_ITEM_KEY } from "../lib/passes"
import { hoursPrice, tripPricing, validHours } from "../lib/trip-pricing"
import { rentalPrice, rentalSpan, rentalUnit, rentalUnits } from "../lib/rental-pricing"
import { RENTAL_DATES_MESSAGE, TRIP_HOURS_MESSAGE } from "./add-booking-to-cart"
import { BOOKING_MODULE } from "../modules/booking"
import type BookingModuleService from "../modules/booking/service"
import { zonedTimeToUtc } from "../modules/booking/utils/slot"
import { BOOKING_MOVED_EVENT, type BookingMovedData } from "./move-booking"

// Staff change a paid rental's dates or a trip-by-the-hour's hours (owner,
// 2026-11-23): the new length is priced like at checkout (the variant's price
// in the order's region) and checked like a move; cheaper → the difference is
// refunded from the captured payment (last); dearer → the extra is an
// outstanding balance on the order, paid at the venue (owner: balance at the
// venue), with its reminder. The customer gets the "booking changed" email.

export type ChangeLengthInput = {
  booking_id: string
  created_by?: string
  // A rental's new dates, or a trip's new hours.
  start_date?: string
  end_date?: string
  hours?: number
}

type Plan = {
  booking_id: string
  order_id: string
  currency_code: string
  resource_id: string
  starts_at: string
  ends_at: string
  new_price: number
  due: number
  refund: { payment_id: string; amount: number; idempotency_key: string; note: string } | null
  not_refunded: number
  // Unpaid balances lowered first when shorter (a deposit order still owes
  // them): [collection, amount before, amount after].
  lowered: { id: string; from: number; to: number }[]
  before: { resource_id: string; starts_at: string; ends_at: string; price: number | null }
}

type Money = number | string | { toJSON?: () => unknown } | null | undefined
const num = (v: Money) => (v === null || v === undefined ? 0 : MathBN.convert(v as number).toNumber())

const planLengthChangeStep = createStep("plan-length-change", async (input: ChangeLengthInput, { container }) => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [b],
  } = await query.graph({
    entity: "booking",
    fields: ["id", "status", "starts_at", "ends_at", "price", "package_id", "resource.id", "resource.timezone", "order.id"],
    filters: { id: input.booking_id },
  })
  if (!b || !b.order?.id) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Booking ${input.booking_id} was not found.`)
  }
  if (b.status !== "confirmed" || new Date(b.ends_at).getTime() <= Date.now()) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Only a confirmed booking not over yet can be changed.")
  }
  const {
    data: [order],
  } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "total",
      "region_id",
      "currency_code",
      "items.metadata",
      "items.total",
      "items.variant_id",
      "payment_collections.id",
      "payment_collections.amount",
      "payment_collections.status",
      "payment_collections.metadata",
      "payment_collections.payments.id",
      "payment_collections.payments.captures.amount",
      "payment_collections.payments.refunds.amount",
    ],
    filters: { id: b.order.id },
  })
  const item = (order?.items ?? []).find((i) => bookingIdOf(i?.metadata as Record<string, unknown> | null) === b.id)
  const meta = (item?.metadata ?? {}) as Record<string, unknown>
  if (!item?.variant_id) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Booking ${input.booking_id} was not found.`)
  }
  if (meta[PASS_ITEM_KEY] || meta[PACKAGE_ITEM_KEY] || b.package_id) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, CHANGE_FREE_MESSAGE)
  }
  const { data: priced } = (await query.graph({
    entity: "product_variant",
    fields: ["id", "metadata", "product.metadata", "calculated_price.calculated_amount"],
    filters: { id: item.variant_id },
    context: { calculated_price: QueryContext({ region_id: order!.region_id, currency_code: order!.currency_code }) },
  })) as unknown as { data: { metadata?: Record<string, unknown> | null; product?: { metadata?: Record<string, unknown> | null }; calculated_price?: { calculated_amount?: number | null } }[] }
  const variant = priced[0]
  const unitPrice = variant?.calculated_price?.calculated_amount
  const tz = b.resource!.timezone
  let starts: Date, ends: Date, newPrice: number
  const rental = rentalUnit(variant?.product)
  if (rental) {
    const units = rentalUnits(rental, input.start_date, input.end_date)
    if (units === null || unitPrice == null) throw new MedusaError(MedusaError.Types.INVALID_DATA, RENTAL_DATES_MESSAGE)
    const span = rentalSpan(rental, input.start_date!, input.end_date!)
    starts = zonedTimeToUtc(span.from, "00:00", tz)
    ends = zonedTimeToUtc(span.to, "00:00", tz)
    newPrice = rentalPrice(unitPrice, units)
  } else if (tripPricing(variant?.product) === "hours") {
    const hours = validHours(input.hours, variant)
    if (hours === null || unitPrice == null) throw new MedusaError(MedusaError.Types.INVALID_DATA, TRIP_HOURS_MESSAGE)
    starts = new Date(b.starts_at)
    ends = new Date(starts.getTime() + hours * 3600_000)
    newPrice = hoursPrice(unitPrice, hours)
  } else {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, CHANGE_NOT_ALLOWED_MESSAGE)
  }
  if (starts.getTime() === new Date(b.starts_at).getTime() && ends.getTime() === new Date(b.ends_at).getTime()) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, CHANGE_SAME_MESSAGE)
  }
  const paid = b.price != null ? num(b.price as Money) : num(item.total as Money)
  const { refund, due } = priceChange(paid, newPrice)
  // The refund comes from the captured payment with the most left.
  const payment = (order!.payment_collections ?? [])
    .flatMap((c) => c?.payments ?? [])
    .filter(Boolean)
    .map((p) => ({
      id: p!.id,
      available:
        (p!.captures ?? []).reduce((s, c) => s + num(c?.amount as Money), 0) -
        (p!.refunds ?? []).reduce((s, r) => s + num(r?.amount as Money), 0),
    }))
    .sort((x, y) => y.available - x.available)[0]
  // Shorter: first lower what the order still owes at the venue (an unpaid
  // booking balance), then refund the rest from what was paid.
  let toCover = refund
  const lowered: Plan["lowered"] = []
  for (const c of order!.payment_collections ?? []) {
    if (toCover <= 0) break
    const m = (c?.metadata ?? {}) as Record<string, unknown>
    if (!c || !m[BALANCE_METADATA_KEY] || c.status !== "not_paid") continue
    const amount = num(c.amount as Money)
    const cut = Math.min(amount, toCover)
    if (cut <= 0) continue
    lowered.push({ id: c.id, from: amount, to: Math.round((amount - cut) * 100) / 100 })
    toCover = Math.round((toCover - cut) * 100) / 100
  }
  const refundable = toCover > 0 && payment ? Math.min(toCover, Math.max(payment.available, 0)) : 0
  return new StepResponse<Plan>({
    booking_id: b.id,
    order_id: order!.id,
    currency_code: order!.currency_code,
    resource_id: b.resource!.id,
    starts_at: starts.toISOString(),
    ends_at: ends.toISOString(),
    new_price: newPrice,
    due,
    refund:
      refundable > 0
        ? {
            payment_id: payment!.id,
            amount: refundable,
            idempotency_key: `booking_change_${b.id}_${starts.toISOString()}_${ends.toISOString()}`,
            note: `Booking ${b.id} shortened: the difference refunded.`,
          }
        : null,
    not_refunded: Math.round((toCover - refundable) * 100) / 100,
    lowered,
    before: { resource_id: b.resource!.id, starts_at: new Date(b.starts_at).toISOString(), ends_at: new Date(b.ends_at).toISOString(), price: b.price != null ? num(b.price as Money) : null },
  })
})

// Unpaid balances lowered (shorter, deposit orders), undone on failure.
const lowerBalancesStep = createStep(
  "lower-balances",
  async (lowered: Plan["lowered"], { container }) => {
    const payment = container.resolve(Modules.PAYMENT)
    for (const l of lowered) await payment.updatePaymentCollections(l.id, { amount: l.to })
    return new StepResponse(lowered.length, lowered)
  },
  async (lowered, { container }) => {
    const payment = container.resolve(Modules.PAYMENT)
    for (const l of lowered ?? []) await payment.updatePaymentCollections(l.id, { amount: l.from })
  }
)

// The new times (locked and checked as a move) and the booking's new price.
const applyLengthChangeStep = createStep(
  "apply-length-change",
  async (plan: Plan, { container }) => {
    const service = container.resolve<BookingModuleService>(BOOKING_MODULE)
    await service.moveBooking({ id: plan.booking_id, resource_id: plan.resource_id, starts_at: new Date(plan.starts_at), ends_at: new Date(plan.ends_at) })
    await service.updateBookings({ id: plan.booking_id, price: plan.new_price })
    return new StepResponse(plan.booking_id, { id: plan.booking_id, ...plan.before })
  },
  async (before, { container }) => {
    if (!before) return
    await container.resolve<BookingModuleService>(BOOKING_MODULE).updateBookings({
      id: before.id,
      resource_id: before.resource_id,
      starts_at: new Date(before.starts_at),
      ends_at: new Date(before.ends_at),
      price: before.price,
    })
  }
)

export const changeBookingLengthWorkflow = createWorkflow("change-booking-length", function (input: ChangeLengthInput) {
  const plan = planLengthChangeStep(input)
  applyLengthChangeStep(plan)
  lowerBalancesStep(transform({ plan }, ({ plan }) => plan.lowered))

  // Dearer: the extra is an outstanding balance, paid at the venue.
  when("length-change-due", plan, (p) => p.due > 0).then(() => {
    const created = createPaymentCollectionsStep(
      transform({ plan }, ({ plan }) => [
        { currency_code: plan.currency_code, amount: plan.due, metadata: { [BALANCE_METADATA_KEY]: true, due_at: plan.starts_at, booking_change: plan.booking_id } },
      ])
    )
    createRemoteLinkStep(
      transform({ plan, created }, ({ plan, created }) => [
        { [Modules.ORDER]: { order_id: plan.order_id }, [Modules.PAYMENT]: { payment_collection_id: created[0].id } },
      ])
    ).config({ name: "link-length-change-balance" })
  })

  // The customer is emailed the new times (booking.moved, by staff).
  emitEventStep({
    eventName: BOOKING_MOVED_EVENT,
    data: transform({ plan }, ({ plan }): BookingMovedData => ({ id: plan.booking_id, by: "staff", previous: plan.before })),
  })

  // Cheaper: the difference refunded, last (money can't be rolled back).
  when("length-change-refund", plan, (p) => p.refund !== null).then(() => {
    refundPaymentWorkflow.runAsStep({
      input: transform({ plan, input }, ({ plan, input }) => ({
        payment_id: plan.refund!.payment_id,
        amount: plan.refund!.amount,
        idempotency_key: plan.refund!.idempotency_key,
        note: plan.refund!.note,
        created_by: input.created_by,
      })),
    })
  })

  return new WorkflowResponse(
    transform({ plan }, ({ plan }) => ({
      starts_at: plan.starts_at,
      ends_at: plan.ends_at,
      price: plan.new_price,
      refunded_amount: plan.refund?.amount ?? 0,
      // Taken off what's still due at the venue (deposit orders).
      balance_lowered: plan.lowered.reduce((s, l) => s + (l.from - l.to), 0),
      // A refund the captured payment couldn't cover (e.g. not captured yet):
      // staff settle it in the order.
      not_refunded: plan.not_refunded,
      balance_due: plan.due,
    }))
  )
})
