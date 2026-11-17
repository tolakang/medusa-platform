import {
  EXTRA_BOOKING_REMOVED_MESSAGE,
  EXTRA_NEEDS_BOOKING_MESSAGE,
  extrasProblem,
  isExtraProduct,
  offeredExtras,
} from "../booking-extras"

// TASKS P3-25: extras on a booking.
describe("booking extras", () => {
  it("knows an extra and what a service offers", () => {
    expect(isExtraProduct({ metadata: { booking_extra: true } })).toBe(true)
    expect(isExtraProduct({ metadata: { booking_extra: "true" } })).toBe(false)
    expect(offeredExtras({ metadata: { extras: "packing-boxes, extra-helper ,," } })).toEqual(["packing-boxes", "extra-helper"])
    expect(offeredExtras({ metadata: { extras: ["insurance"] } })).toEqual(["insurance"])
    expect(offeredExtras({ metadata: null })).toEqual([])
  })

  it("keeps every extra with a booking in the same cart", () => {
    const booking = { metadata: { booking_id: "book_1" }, is_extra: false }
    const extra = (forId?: string) => ({ metadata: forId ? { booking_extra_for: forId } : {}, is_extra: true })
    expect(extrasProblem([booking, extra("book_1")], new Set(["book_1"]))).toBeNull()
    expect(extrasProblem([extra()], new Set())).toBe(EXTRA_NEEDS_BOOKING_MESSAGE)
    expect(extrasProblem([extra("book_2")], new Set(["book_1"]))).toBe(EXTRA_BOOKING_REMOVED_MESSAGE)
    expect(extrasProblem([booking], new Set(["book_1"]))).toBeNull()
  })
})
