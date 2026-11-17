import { model } from "@medusajs/framework/utils"

// One ticket for an event (kind F, TASKS P3-24, plan §9.3; as the Ticket
// Booking recipe's TicketPurchase, by section instead of numbered seat,
// owner 2026-11-17). Issued when the order is placed: one per unit of an
// event line item. Seats per date and section are Medusa inventory (the
// variant's inventory item), so this only records the ticket and its code.
// Order, line item and variant ids are plain text (no keys into core tables).
export const BookingTicket = model
  .define("booking_ticket", {
    id: model.id({ prefix: "btick" }).primaryKey(),
    // What the customer shows at the door, e.g. "K7QW-P3MZ-XA".
    code: model.text(),
    order_id: model.text(),
    line_item_id: model.text(),
    variant_id: model.text().nullable(),
    // The event and the ticket's date and section, as sold.
    event_title: model.text(),
    label: model.text(),
    event_starts_at: model.dateTime().nullable(),
    // valid: not used yet; used: let in at the door (used_at).
    status: model.enum(["valid", "used"]).default("valid"),
    used_at: model.dateTime().nullable(),
  })
  .indexes([{ on: ["code"], unique: true }, { on: ["order_id"] }, { on: ["line_item_id"] }])
