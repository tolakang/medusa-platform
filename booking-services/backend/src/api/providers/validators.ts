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
