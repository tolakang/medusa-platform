import { z } from "@medusajs/framework/zod"

// Store booking routes (TASKS P3-10). Times are ISO 8601 instants; a date is
// a local calendar date of the resource.
const instant = z.string().datetime({ offset: true })

export const GetBookingAvailability = z.object({
  resource_id: z.string().min(1),
  starts_at: instant,
  ends_at: instant,
})

export const GetBookingSlots = z.object({
  variant_id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD"),
  resource_id: z.string().min(1).optional(),
  // Default: the variant's metadata.duration_minutes, else 60 (P3-12).
  duration_minutes: z.coerce.number().int().min(5).max(720).optional(),
})

export const PostBookingCancel = z.object({ booking_id: z.string().min(1) })
export type PostBookingCancelType = z.infer<typeof PostBookingCancel>

export const PostBookingCart = z.object({
  cart_id: z.string().min(1),
  variant_id: z.string().min(1),
  resource_id: z.string().min(1),
  // Times for every kind but a rental, which sends its dates (P3-22).
  starts_at: instant.optional(),
  ends_at: instant.optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  // Seats on a scheduled departure (kind D, P3-23).
  seats: z.number().int().min(1).max(100).nullish(),
  // Extras with the booking (P3-25).
  extras: z.array(z.object({ variant_id: z.string().min(1), quantity: z.number().int().min(1).max(20) })).max(10).nullish(),
  // An accepted quote (P3-27).
  quote_id: z.string().min(1).nullish(),
  notes: z.string().max(500).nullish(),
  // A visit at the customer's place (kind B, P3-20).
  address: z.string().max(300).nullish(),
  // A trip (kind C, P3-21): drop-off, and hours or the two zones.
  dropoff_address: z.string().max(300).nullish(),
  hours: z.number().int().min(1).max(24).nullish(),
  from_zone_id: z.string().min(1).nullish(),
  to_zone_id: z.string().min(1).nullish(),
})
export type PostBookingCartType = z.infer<typeof PostBookingCart>

// Quotes (TASKS P3-27).
export const PostQuoteRequest = z.object({
  variant_id: z.string().min(1),
  details: z.string().trim().min(5).max(2000),
  wished_starts_at: instant,
  address: z.string().max(300).nullish(),
  dropoff_address: z.string().max(300).nullish(),
})
export type PostQuoteRequestType = z.infer<typeof PostQuoteRequest>
export const PostQuoteAccept = z.object({ cart_id: z.string().min(1) })
export type PostQuoteAcceptType = z.infer<typeof PostQuoteAccept>

// Move a booking (TASKS P3-28).
export const PostBookingMove = z.object({
  booking_id: z.string().min(1),
  resource_id: z.string().min(1),
  starts_at: instant,
  ends_at: instant,
})
export type PostBookingMoveType = z.infer<typeof PostBookingMove>
