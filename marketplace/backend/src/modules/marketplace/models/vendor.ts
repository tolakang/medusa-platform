import { model } from "@medusajs/framework/utils"
import { VendorAdmin } from "./vendor-admin"
import { VendorCommission } from "./vendor-commission"
import { VendorPayout } from "./vendor-payout"

// A vendor: sells their own products on the marketplace (BUILD_PLAN §9.6,
// TASKS P6-01). Their products, child orders and stock locations are module
// links (P6-02); the people who sign in for them are vendor admins (actor
// type `vendor`, P6-03).
export const Vendor = model
  .define("vendor", {
    id: model.id({ prefix: "ven" }).primaryKey(),
    // URL-safe name for the shop page: lowercase letters, digits and single
    // hyphens.
    handle: model.text(),
    name: model.text(),
    // Contact address for the vendor's business (not a login).
    email: model.text(),
    // Logo URL (uploaded through the File Module). Null until set.
    logo: model.text().nullable(),
    // Shown on the shop page; contact and payout details the vendor keeps
    // up to date in the portal's settings (2026-11-25). payout_account: the
    // bank / ABA account the marketplace pays into (free text, e.g.
    // "ABA 000 123 456, Dara Sok").
    description: model.text().nullable(),
    phone: model.text().nullable(),
    telegram: model.text().nullable(),
    payout_account: model.text().nullable(),
    // pending: signed up, waiting for the admin's approval (P6-03);
    // active: may sell; suspended: stopped by the admin.
    status: model.enum(["pending", "active", "suspended"]).default("pending"),
    // Platform commission in percent, 0 to 100. Null = the marketplace
    // default (MARKETPLACE_DEFAULT_COMMISSION_RATE), read when a commission
    // is recorded (P6-06).
    commission_rate: model.float().nullable(),
    admins: model.hasMany(() => VendorAdmin, { mappedBy: "vendor" }),
    payouts: model.hasMany(() => VendorPayout, { mappedBy: "vendor" }),
    commissions: model.hasMany(() => VendorCommission, { mappedBy: "vendor" }),
  })
  .indexes([{ on: ["handle"], unique: true }])
  .checks([
    {
      name: "vendor_handle_format",
      expression: (columns) => `${columns.handle} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`,
    },
    {
      name: "vendor_commission_rate_percent",
      expression: (columns) =>
        `${columns.commission_rate} IS NULL OR (${columns.commission_rate} >= 0 AND ${columns.commission_rate} <= 100)`,
    },
  ])
