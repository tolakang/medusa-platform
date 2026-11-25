import { model } from "@medusajs/framework/utils"
import { SellerAdjustment } from "./seller-adjustment"
import { SellerCommission } from "./seller-commission"
import { SellerPayout } from "./seller-payout"

// A reseller: sells your products on their own storefront domain and earns a
// commission on each order (BUILD_PLAN §9.5, TASKS P5-01). Their sales
// channel (and its publishable key) is a module link (P5-02); their login is
// the custom actor type `seller` (P5-03).
export const Seller = model
  .define("seller", {
    id: model.id({ prefix: "sel" }).primaryKey(),
    // URL-safe name: lowercase letters, digits and single hyphens. Used for
    // `SELLER_RESOLVE_MODE=path` and in admin lists.
    handle: model.text(),
    name: model.text(),
    email: model.text(),
    // The seller's storefront host, e.g. "shop.seller.com" (lowercase, no
    // scheme or path). Null until they have one.
    domain: model.text().nullable(),
    // pending: signed up, not selling yet; active: their channel earns
    // commissions (P5-04 ignores other statuses); suspended: stopped.
    status: model.enum(["pending", "active", "suspended"]).default("pending"),
    // Percent of the order total, 0 to 100. Null = the shop's default
    // (RESELLER_DEFAULT_COMMISSION_RATE), read when a commission is recorded.
    commission_rate: model.float().nullable(),
    // When the seller accepted the invitation and set a password; null =
    // still invited (the admin list shows "Invited", the code stays visible).
    accepted_at: model.dateTime().nullable(),
    // The owner holds this seller's payouts: the payout day approves nothing
    // of theirs until the hold is lifted.
    payout_hold: model.boolean().default(false),
    // The seller's own contact and payout details (settings page).
    phone: model.text().nullable(),
    telegram: model.text().nullable(),
    payout_bank_name: model.text().nullable(),
    payout_account_name: model.text().nullable(),
    payout_account_number: model.text().nullable(),
    commissions: model.hasMany(() => SellerCommission, {
      mappedBy: "seller",
    }),
    adjustments: model.hasMany(() => SellerAdjustment, {
      mappedBy: "seller",
    }),
    payouts: model.hasMany(() => SellerPayout, {
      mappedBy: "seller",
    }),
  })
  .indexes([
    { on: ["handle"], unique: true },
    { on: ["domain"], unique: true },
  ])
  .checks([
    {
      name: "seller_handle_format",
      expression: (columns) => `${columns.handle} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`,
    },
    {
      // A lowercase host name with at least one dot, so the storefront's
      // Host lookup (P5-07) matches it exactly.
      name: "seller_domain_format",
      expression: (columns) =>
        `${columns.domain} IS NULL OR ${columns.domain} ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'`,
    },
    {
      name: "seller_commission_rate_percent",
      expression: (columns) =>
        `${columns.commission_rate} IS NULL OR (${columns.commission_rate} >= 0 AND ${columns.commission_rate} <= 100)`,
    },
  ])
