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

// The customer's email when staff moved their booking (TASKS P3-28).
export const BOOKING_MOVED_TEMPLATE = "booking-moved"

export type BookingMovedEmailData = {
  customer_name?: string | null
  service?: string | null
  calendar: string
  timezone: string
  starts_at: string
  ends_at: string
  previous_starts_at: string
}

export function bookingMovedEmail(data: BookingMovedEmailData, escape: (s: string) => string) {
  const fmt = (iso: string, withDay = true) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: data.timezone,
      ...(withDay ? { weekday: "short", day: "numeric", month: "short" } : {}),
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(iso))
  const now = `${fmt(data.starts_at)}–${fmt(data.ends_at, false)} with ${data.calendar}`
  const what = data.service ? escape(data.service) : "Your booking"
  const html = `<!doctype html>
<html><body style="font-family:Arial,sans-serif;color:#111">
<h2>Your booking has changed</h2>
<p>${data.customer_name ? `Hello ${escape(data.customer_name)},` : "Hello,"}</p>
<p>${what} is now on <strong>${escape(now)}</strong> (it was ${escape(fmt(data.previous_starts_at))}).</p>
<p>If this time doesn't suit you, reply to this email or change it in your account.</p>
</body></html>`
  return { subject: `Booking changed: ${now}`, html }
}
