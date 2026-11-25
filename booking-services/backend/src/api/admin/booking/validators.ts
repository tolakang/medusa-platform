import { z } from "@medusajs/framework/zod"
import { walkInContact } from "../../walk-in-contact"

// Admin booking routes (TASKS P3-11). Weekly hours as in booking_schedule
// (P3-01): weekday 0-6 (0 = Sunday), "HH:MM" local to the resource.
const hhmm = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "must be HH:MM")
const hours = z
  .object({ weekday: z.number().int().min(0).max(6), start_time: hhmm, end_time: hhmm })
  .refine((h) => h.start_time < h.end_time, "start_time must be before end_time")
const type = z.enum(["staff", "room", "equipment", "venue"])
const instant = z.string().datetime({ offset: true })

export const PostAdminBookingResource = z.object({
  name: z.string().min(1),
  type,
  capacity: z.number().int().min(1).optional(),
  timezone: z.string().min(1).optional(),
  is_active: z.boolean().optional(),
  // Booked by whole days (a rental, P3-22).
  whole_days: z.boolean().optional(),
  schedules: z.array(hours).optional(),
  variant_ids: z.array(z.string().min(1)).optional(),
})
export type PostAdminBookingResourceType = z.infer<typeof PostAdminBookingResource>

export const PostAdminBookingResourceUpdate = PostAdminBookingResource.partial().extend({
  // A Telegram chat ID (digits, a group's starts with -), or null to use the
  // staff group (TASKS P3-28).
  telegram_chat_id: z.string().trim().regex(/^-?\d{1,20}$/, "must be a Telegram chat ID (digits)").nullable().optional(),
})
export type PostAdminBookingResourceUpdateType = z.infer<typeof PostAdminBookingResourceUpdate>

export const GetAdminBookings = z.object({
  resource_id: z.string().min(1).optional(),
  from: instant,
  to: instant,
})

export const PostAdminWalkIn = z.object({
  resource_id: z.string().min(1),
  starts_at: instant,
  ends_at: instant,
  customer_id: z.string().min(1).nullish(),
  notes: z.string().max(500).nullish(),
  ...walkInContact,
})
export type PostAdminWalkInType = z.infer<typeof PostAdminWalkIn>

// Providers (TASKS P3-31): invite a staff member for a staff resource (or a
// new one), then approve, suspend or reactivate providers and set a partner's
// commission rate.
export const PostAdminBookingStaffInvite = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email(),
  resource_id: z.string().min(1).optional(),
  timezone: z.string().min(1).optional(),
})
export type PostAdminBookingStaffInviteType = z.infer<typeof PostAdminBookingStaffInvite>

export const PostAdminBookingProvider = z
  .object({
    name: z.string().trim().min(1).max(120),
    status: z.enum(["active", "suspended"]),
    commission_rate: z.number().min(0).max(100).nullable(),
    // Why: required to decline a pending partner (status suspended).
    status_reason: z.string().trim().min(1).max(500),
  })
  .partial()
export type PostAdminBookingProviderType = z.infer<typeof PostAdminBookingProvider>

// Partner money (TASKS P3-33).
export const PostAdminCommissionSettle = z.object({ action: z.enum(["keep", "cancel"]) })
export type PostAdminCommissionSettleType = z.infer<typeof PostAdminCommissionSettle>

export const PostAdminPayoutPay = z.object({ reference: z.string().trim().min(1).max(200) })
export type PostAdminPayoutPayType = z.infer<typeof PostAdminPayoutPay>

// Trip zones (TASKS P3-21).
export const PostAdminZone = z.object({
  name: z.string().trim().min(1).max(80),
  rank: z.number().int().min(0).max(1000).optional(),
})
export type PostAdminZoneType = z.infer<typeof PostAdminZone>

export const PostAdminZonePrice = z.object({
  variant_id: z.string().min(1),
  from_zone_id: z.string().min(1),
  to_zone_id: z.string().min(1),
  amount: z.number().min(0).max(1_000_000),
  minutes: z.number().int().min(5).max(1440),
  currency_code: z.string().regex(/^[a-z]{3}$/),
})
export type PostAdminZonePriceType = z.infer<typeof PostAdminZonePrice>

// Quotes (TASKS P3-27).
export const PostAdminQuote = z.object({
  amount: z.number().min(0).max(1_000_000),
  currency_code: z.string().regex(/^[a-z]{3}$/),
  resource_id: z.string().min(1),
  starts_at: z.string().datetime({ offset: true }),
  duration_minutes: z.number().int().min(15).max(24 * 60 * 14),
  reply: z.string().max(2000).nullish(),
  valid_days: z.number().int().min(1).max(60).optional(),
})
export type PostAdminQuoteType = z.infer<typeof PostAdminQuote>

// Assign or move a booking (TASKS P3-28).
export const PostAdminBookingMove = z
  .object({
    resource_id: z.string().min(1).optional(),
    starts_at: z.string().datetime({ offset: true }).optional(),
  })
  .refine((v) => v.resource_id || v.starts_at, { message: "Give a calendar or a start." })
export type PostAdminBookingMoveType = z.infer<typeof PostAdminBookingMove>

// Hide or show a review (TASKS P3-29).
export const PostAdminReview = z
  .object({
    status: z.enum(["published", "hidden"]).optional(),
    // The shop's answer; "" or null removes it (P3-29 follow-up).
    reply: z.string().max(1000).nullish(),
  })
  .refine((v) => v.status !== undefined || v.reply !== undefined, { message: "Give a status or a reply." })
export type PostAdminReviewType = z.infer<typeof PostAdminReview>

// Move a whole event package (TASKS P3-30 follow-up).
export const PostAdminEventMove = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD") })
export type PostAdminEventMoveType = z.infer<typeof PostAdminEventMove>

// Change a paid rental's dates or a trip's hours (owner, 2026-11-23).
export const PostAdminBookingChange = z
  .object({
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    hours: z.number().int().min(1).max(24).optional(),
  })
  .refine((v) => (v.start_date && v.end_date) || v.hours, { message: "Give the new dates, or the hours." })
export type PostAdminBookingChangeType = z.infer<typeof PostAdminBookingChange>

// Gap review 2026-11-24: edit a zone or a zone price, change a pass's credits
// or end it, and take someone off the waitlist.
export const PostAdminZoneUpdate = PostAdminZone.partial().refine((b) => Object.keys(b).length > 0, { message: "Send name or rank." })
export type PostAdminZoneUpdateType = z.infer<typeof PostAdminZoneUpdate>

export const PostAdminZonePriceUpdate = z
  .object({ amount: z.number().min(0).max(1_000_000), minutes: z.number().int().min(5).max(1440) })
  .partial()
  .refine((b) => Object.keys(b).length > 0, { message: "Send amount or minutes." })
export type PostAdminZonePriceUpdateType = z.infer<typeof PostAdminZonePriceUpdate>

export const PostAdminPass = z
  .object({
    credits_left: z.number().int().min(0).optional(),
    // "now" ends the pass today.
    expires_at: z.union([z.literal("now"), z.string().datetime({ offset: true })]).optional(),
  })
  .refine((b) => b.credits_left !== undefined || b.expires_at !== undefined, { message: "Send credits_left or expires_at." })
export type PostAdminPassType = z.infer<typeof PostAdminPass>
