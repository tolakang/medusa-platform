import { model } from "@medusajs/framework/utils"

// A quote for a booking (TASKS P3-27, plan §9.3 "Quote first": moving,
// repairs, catering). Owner, 2026-11-17: Booking's own (not Wholesale's B2B
// quotes); an accepted quote is booked into the cart at the quoted price and
// paid at checkout. Customer, variant, resource and booking ids are plain text
// (no keys into core tables).
//
// requested: the customer asked; quoted: staff set a price, a calendar and a
// time; accepted: its booking was paid (order placed); declined: the customer
// or staff said no; expired: not accepted before valid_until.
export const BookingQuote = model
  .define("booking_quote", {
    id: model.id({ prefix: "bquo" }).primaryKey(),
    customer_id: model.text(),
    variant_id: model.text(),
    // What the customer wants, in their words, and where.
    details: model.text(),
    address: model.text().nullable(),
    dropoff_address: model.text().nullable(),
    // The day and time they'd like; staff may propose another.
    wished_starts_at: model.dateTime(),
    status: model.enum(["requested", "quoted", "accepted", "declined", "expired"]).default("requested"),
    // Set when quoted: the price (whole booking), where and when.
    amount: model.bigNumber().nullable(),
    currency_code: model.text().nullable(),
    resource_id: model.text().nullable(),
    starts_at: model.dateTime().nullable(),
    ends_at: model.dateTime().nullable(),
    reply: model.text().nullable(),
    valid_until: model.dateTime().nullable(),
    // The booking made from it, once accepted.
    booking_id: model.text().nullable(),
  })
  .indexes([{ on: ["customer_id"] }, { on: ["status"] }])
  .checks([
    {
      name: "booking_quote_amount_not_negative",
      expression: (c) => `${c.amount} IS NULL OR ${c.amount} >= 0`,
    },
  ])
