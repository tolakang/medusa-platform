import { strict as assert } from "node:assert"
import { describe, it } from "node:test"
import {
  durationMinutes,
  formatBookingRange,
  formatSlotTime,
  bookingStatusLabel,
  isServiceOnlyCart,
  depositPercent,
  depositSplit,
  paymentPlanText,
  isDepartureService,
  isEventProduct,
  isExtraProduct,
  extraFor,
  offeredExtras,
  isVisitService,
  maxSeats,
  rentalUnit,
  itemBooking,
  localDate,
  orderedServices,
  serviceChoiceLabel,
} from "../booking.ts"

// TASKS P3-13: the storefront's booking helpers.
const PP = "Asia/Phnom_Penh"

describe("booking helpers", () => {
  it("reads a service variant's length", () => {
    assert.equal(durationMinutes({ metadata: { duration_minutes: 60 } }), 60)
    assert.equal(durationMinutes({ metadata: { duration_minutes: "30" } }), 30)
    assert.equal(durationMinutes({ metadata: { duration_minutes: 0 } }), null)
    assert.equal(durationMinutes({ metadata: null }), null)
    assert.equal(durationMinutes(undefined), null)
  })

  it("knows a cart of services only", () => {
    const item = (requires_shipping: boolean) => ({ requires_shipping }) as never
    assert.equal(isServiceOnlyCart({ items: [item(false), item(false)] }), true)
    assert.equal(isServiceOnlyCart({ items: [item(false), item(true)] }), false)
    assert.equal(isServiceOnlyCart({ items: [] }), false)
    assert.equal(isServiceOnlyCart(null), false)
  })

  it("reads a booking line item", () => {
    assert.deepEqual(
      itemBooking({
        metadata: {
          booking_id: "book_1",
          booking_starts_at: "2026-11-09T03:00:00.000Z",
          booking_ends_at: "2026-11-09T04:00:00.000Z",
          booking_resource_name: "Sophea",
          booking_timezone: PP,
        },
      }),
      { starts_at: "2026-11-09T03:00:00.000Z", ends_at: "2026-11-09T04:00:00.000Z", resource: "Sophea", timezone: PP, address: null, dropoff: null, trip: null, wholeDays: false, seats: 1 }
    )
    // A visit at the customer's place carries its address (P3-20).
    assert.equal(
      itemBooking({ metadata: { booking_id: "book_2", booking_starts_at: "2026-11-09T03:00:00.000Z", booking_address: "#12, St 310" } })?.address,
      "#12, St 310"
    )
    assert.equal(isVisitService({ metadata: { booking_kind: "B" } }), true)
    assert.equal(isVisitService({ metadata: { booking_kind: "A" } }), false)
    assert.equal(isVisitService({ metadata: null }), false)
    // Deposits (P3-26).
    assert.equal(depositPercent({ metadata: { deposit_percent: 30 } }), 30)
    assert.equal(depositPercent({ metadata: { deposit_percent: 100 } }), null)
    assert.deepEqual(depositSplit([{ total: 30, product: { metadata: { deposit_percent: 30 } } }, { total: 6, product: { metadata: {} } }]), { now: 15, later: 21, plan: false })
    // A payment plan (P3-30): its first instalment now.
    const plan = [{ percent: 30 }, { percent: 40, days_before: 30 }, { percent: 30, days_before: 7 }]
    assert.deepEqual(depositSplit([{ total: 150, product: { metadata: { payment_plan: plan } } }]), { now: 45, later: 105, plan: true })
    assert.equal(paymentPlanText({ payment_plan: plan }), "Pay 30% now, 40% 30 days before, 30% 7 days before.")
    assert.equal(depositSplit([{ total: 8, product: { metadata: {} } }]), null)
    // Extras (P3-25).
    assert.equal(isExtraProduct({ metadata: { booking_extra: true } }), true)
    assert.deepEqual(offeredExtras({ metadata: { extras: "packing-boxes, extra-helper" } }), ["packing-boxes", "extra-helper"])
    assert.equal(extraFor({ metadata: { booking_extra_for: "book_1" } }), "book_1")
    assert.equal(extraFor({ metadata: {} }), null)
    // Events (P3-24).
    assert.equal(isEventProduct({ metadata: { booking_kind: "F" } }), true)
    assert.equal(isEventProduct({ metadata: { booking_kind: "E" } }), false)
    // Departures (P3-23).
    assert.equal(isDepartureService({ metadata: { booking_kind: "D" } }), true)
    assert.equal(maxSeats({ metadata: { max_seats: 8 } }), 8)
    assert.equal(maxSeats({ metadata: null }), 10)
    assert.equal(
      itemBooking({ metadata: { booking_id: "b", booking_starts_at: "2026-11-09T03:00:00.000Z", booking_seats: 3 } })?.seats,
      3
    )
    // Rentals by dates (P3-22).
    assert.equal(rentalUnit({ metadata: { booking_kind: "E", rental_unit: "night" } }), "night")
    assert.equal(rentalUnit({ metadata: { booking_kind: "E" } }), null)
    assert.equal(rentalUnit({ metadata: { booking_kind: "C", rental_unit: "day" } }), null)
    assert.equal(itemBooking({ metadata: { note: "x" } }), null)
    assert.equal(itemBooking(null), null)
  })

  it("formats times in the resource's zone, the same on every runtime", () => {
    assert.equal(formatBookingRange("2026-11-09T03:00:00.000Z", "2026-11-09T04:00:00.000Z", PP), "Mon 9 Nov, 10:00–11:00")
    assert.equal(formatSlotTime("2026-11-09T03:00:00.000Z", PP), "10:00")
    assert.equal(localDate(PP, 0, new Date("2026-11-08T18:00:00Z")), "2026-11-09")
    assert.equal(localDate(PP, 1, new Date("2026-11-08T18:00:00Z")), "2026-11-10")
  })

  it("labels a service order by its bookings' status", () => {
    assert.equal(bookingStatusLabel(["confirmed"]), "Confirmed")
    assert.equal(bookingStatusLabel(["cancelled", "cancelled"]), "Cancelled")
    assert.equal(bookingStatusLabel(["confirmed", "cancelled"]), "1 confirmed, 1 cancelled")
    assert.equal(bookingStatusLabel(["no_show"]), "No-show")
    assert.equal(bookingStatusLabel([]), "Booked")
    assert.equal(bookingStatusLabel(["confirmed"], "canceled"), "Cancelled")
  })
})

describe("service choices (TASKS P3-19)", () => {
  it("labels the choice with the product's own option", () => {
    assert.equal(serviceChoiceLabel({ options: [{ title: "Party size" }] }), "Party size")
    assert.equal(serviceChoiceLabel({ options: [{ title: "Length" }] }), "Length")
    assert.equal(serviceChoiceLabel({ options: [] }), "Option")
    assert.equal(serviceChoiceLabel({}), "Option")
  })

  it("orders party sizes, then lengths, then titles", () => {
    const tables = [
      { title: "2 people", metadata: { duration_minutes: 90, party_size: 2 } },
      { title: "6 people", metadata: { duration_minutes: 90, party_size: 6 } },
      { title: "4 people", metadata: { duration_minutes: 90, party_size: 4 } },
    ]
    assert.deepEqual(orderedServices(tables).map((v) => v.title), ["2 people", "4 people", "6 people"])
    const cuts = [
      { title: "60 min", metadata: { duration_minutes: 60 } },
      { title: "30 min", metadata: { duration_minutes: 30 } },
    ]
    assert.deepEqual(orderedServices(cuts).map((v) => v.title), ["30 min", "60 min"])
    assert.deepEqual(tables.map((v) => v.title), ["2 people", "6 people", "4 people"], "the input is not changed")
  })
})
