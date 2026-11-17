// Moving a booking (TASKS P3-28): to another time (the customer
// reschedules) or another calendar (staff assign a person, vehicle or item).
// Pure, so it's unit-tested on its own.

export const MOVE_NOT_ALLOWED_MESSAGE = "This booking can't be moved."
export const MOVE_STARTED_MESSAGE = "This booking has already started."
export const MOVE_TOO_LATE_MESSAGE =
  "It's too close to the start to move this booking online. Please contact the shop."
export const MOVE_LENGTH_MESSAGE = "The new time must be as long as the booking."
export const MOVE_SAME_MESSAGE = "Choose a different time or calendar."
export const MOVE_SERVICE_MESSAGE = "This calendar doesn't offer this service."

export type MoveDecision = { allowed: true } | { allowed: false; message: string }

// A customer moves their confirmed booking until the same cutoff that still
// refunds a cancellation (BOOKING_CANCEL_HOURS): later moves would get round
// the no-refund rule. Staff move pending or confirmed bookings until they
// end, without the cutoff.
export function moveDecision(
  booking: { status: string; starts_at: Date | string; ends_at: Date | string },
  now: Date,
  by: "customer" | "staff",
  cancelHours: number
): MoveDecision {
  const starts = new Date(booking.starts_at).getTime()
  if (by === "customer") {
    if (booking.status !== "confirmed") {
      return { allowed: false, message: MOVE_NOT_ALLOWED_MESSAGE }
    }
    if (starts <= now.getTime()) {
      return { allowed: false, message: MOVE_STARTED_MESSAGE }
    }
    if (starts - now.getTime() < cancelHours * 3600_000) {
      return { allowed: false, message: MOVE_TOO_LATE_MESSAGE }
    }
    return { allowed: true }
  }
  if (booking.status !== "pending" && booking.status !== "confirmed") {
    return { allowed: false, message: MOVE_NOT_ALLOWED_MESSAGE }
  }
  if (new Date(booking.ends_at).getTime() <= now.getTime()) {
    return { allowed: false, message: MOVE_STARTED_MESSAGE }
  }
  return { allowed: true }
}

// The new end keeps the booking's length.
export function movedEnd(booking: { starts_at: Date | string; ends_at: Date | string }, startsAt: Date): Date {
  return new Date(startsAt.getTime() + (new Date(booking.ends_at).getTime() - new Date(booking.starts_at).getTime()))
}
