import { z } from "@medusajs/framework/zod"

// Provider routes (TASKS P3-31).
const text = (max: number) => z.string().trim().min(1).max(max)
const optionalText = (max: number) => z.string().trim().max(max).nullish()
const phone = z
  .string()
  .trim()
  .regex(/^[0-9+\-() ]{6,20}$/, "must be a phone number")
  .nullish()

// Partner sign-up: their own details; the email comes from the registration.
export const PostProviderCreate = z.object({
  name: text(120),
  handle: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "use lowercase letters, digits and single hyphens")
    .max(60)
    .optional(),
  phone,
  bio: optionalText(2000),
  area: optionalText(200),
})
export type PostProviderCreateType = z.infer<typeof PostProviderCreate>

// Staff accept: the code the admin gave with the invitation.
export const PostProviderAccept = z.object({ invite_code: z.string().min(1).max(40) })
export type PostProviderAcceptType = z.infer<typeof PostProviderAccept>

// A provider edits their own profile (never role, status or rate).
export const PostProviderMe = z
  .object({
    name: text(120),
    phone,
    bio: optionalText(2000),
    photo: z.string().url().max(2000).nullish(),
    area: optionalText(200),
  })
  .partial()
export type PostProviderMeType = z.infer<typeof PostProviderMe>

// A provider's own calendars and services (TASKS P3-32).
const instant = z.string().datetime({ offset: true })
const hhmm = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, "must be HH:MM")
const hours = z
  .object({ weekday: z.number().int().min(0).max(6), start_time: hhmm, end_time: hhmm })
  .refine((h) => h.start_time < h.end_time, "start_time must be before end_time")

export const GetProviderBookings = z.object({
  resource_id: z.string().min(1).optional(),
  from: instant,
  to: instant,
})

// A walk-in: no customer id (a provider doesn't look customers up).
export const PostProviderWalkIn = z.object({
  resource_id: z.string().min(1),
  starts_at: instant,
  ends_at: instant,
  notes: z.string().max(500).nullish(),
})
export type PostProviderWalkInType = z.infer<typeof PostProviderWalkIn>

export const PostProviderHours = z.object({ schedules: z.array(hours).max(42) })
export type PostProviderHoursType = z.infer<typeof PostProviderHours>

export const PostProviderDayOff = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD"),
})
export type PostProviderDayOffType = z.infer<typeof PostProviderDayOff>

const length = z.object({
  minutes: z.number().int().min(5).max(720),
  price: z.number().min(0).max(1_000_000),
})

export const PostProviderService = z.object({
  title: text(120),
  description: optionalText(2000),
  lengths: z
    .array(length)
    .min(1)
    .max(10)
    .refine((l) => new Set(l.map((x) => x.minutes)).size === l.length, "each length once"),
})
export type PostProviderServiceType = z.infer<typeof PostProviderService>

export const PostProviderServiceUpdate = z
  .object({
    title: text(120),
    description: z.string().trim().max(2000),
    status: z.enum(["draft", "published"]),
    prices: z.array(z.object({ variant_id: z.string().min(1), price: z.number().min(0).max(1_000_000) })).max(10),
  })
  .partial()
export type PostProviderServiceUpdateType = z.infer<typeof PostProviderServiceUpdate>
