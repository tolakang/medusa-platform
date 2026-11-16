import { model } from "@medusajs/framework/utils"
import { BookingCommission } from "./booking-commission"
import { BookingPayout } from "./booking-payout"
import { BookingResource } from "./booking-resource"

// A provider: one person who signs in to serve bookings (actor type
// `provider`; BUILD_PLAN §9.3 "Providers", D13, TASKS P3-31, F-088). One
// provider is one sign-in (owner, 2026-11-16: "One person").
// - staff: invite-only, as POS cashiers (invite code, F-036); an admin invites
//   them for a staff resource, and they manage only that calendar. No
//   commission.
// - partner: signs up on their own (open marketplace), confirms the email and
//   waits for the admin's approval before anything of theirs is public.
// What they own: their resources (relation below, in this module) and their
// services (link booking-provider-product).
export const BookingProvider = model
  .define("booking_provider", {
    id: model.id({ prefix: "bprov" }).primaryKey(),
    role: model.enum(["staff", "partner"]),
    // invited: staff not yet accepted; pending: partner waiting for approval;
    // active: may sign in and serve; suspended: stopped by the admin.
    status: model.enum(["invited", "pending", "active", "suspended"]),
    // Sign-in email, stored lowercase (the workflows normalise it).
    email: model.text(),
    name: model.text(),
    // URL-safe name for the public provider page (P3-32): lowercase letters,
    // digits and single hyphens.
    handle: model.text(),
    phone: model.text().nullable(),
    bio: model.text().nullable(),
    // Photo URL (File Module). Null until set.
    photo: model.text().nullable(),
    // Where they serve, in words (e.g. "Siem Reap town").
    area: model.text().nullable(),
    // Partner commission in percent, 0 to 100 (P3-33). Null = the shop's
    // default. Staff earn no commission.
    commission_rate: model.float().nullable(),
    resources: model.hasMany(() => BookingResource, { mappedBy: "provider" }),
    commissions: model.hasMany(() => BookingCommission, { mappedBy: "provider" }),
    payouts: model.hasMany(() => BookingPayout, { mappedBy: "provider" }),
  })
  .indexes([
    { on: ["email"], unique: true },
    { on: ["handle"], unique: true },
  ])
  .checks([
    {
      name: "booking_provider_handle_format",
      expression: (columns) => `${columns.handle} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`,
    },
    {
      name: "booking_provider_commission_rate_percent",
      expression: (columns) =>
        `${columns.commission_rate} IS NULL OR (${columns.commission_rate} >= 0 AND ${columns.commission_rate} <= 100)`,
    },
  ])
