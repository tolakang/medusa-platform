import { randomInt } from "node:crypto"
import { escapeHtml } from "@medusa-platform/medusa-core/lib/order-notification"

// Event tickets (kind F, TASKS P3-24, plan §9.3). An event is a product with
// metadata.booking_kind "F"; each variant is a date and a section (options),
// with metadata.event_starts_at (ISO) and Medusa inventory = the section's
// seats. Pure helpers, unit-tested in __tests__/event-tickets.unit.spec.ts.

type Meta = Record<string, unknown> | null | undefined

export const EVENT_KIND = "F"
export const EVENT_TICKETS_TEMPLATE = "event-tickets"

export const isEventProduct = (product: { metadata?: Meta } | null | undefined) =>
  product?.metadata?.booking_kind === EVENT_KIND

// No 0/O, 1/I/L: read out and typed by hand at the door.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"

/** A random ticket code, e.g. "K7QW-P3MZ-XA" (10 characters, ~49 bits). */
export function ticketCode(random: (max: number) => number = randomInt): string {
  let s = ""
  for (let i = 0; i < 10; i++) {
    s += ALPHABET[random(ALPHABET.length)]
  }
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`
}

/** A typed code in the stored form (case, spaces and dashes ignored). */
export function normalizeTicketCode(input: unknown): string | null {
  if (typeof input !== "string") {
    return null
  }
  const s = input.toUpperCase().replace(/[^A-Z0-9]/g, "")
  return s.length === 10 ? `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}` : null
}

export type EventTicketsData = {
  order_display_id: number | null
  customer_name?: string | null
  tickets: { code: string; event_title: string; label: string }[]
}

export function eventTicketsEmail(data: EventTicketsData) {
  const hello = data.customer_name ? `Hello ${escapeHtml(data.customer_name)},` : "Hello,"
  const rows = data.tickets
    .map(
      (t) =>
        `<tr><td style="padding:8px 12px;border:1px solid #ddd">${escapeHtml(t.event_title)}<br><span style="color:#555">${escapeHtml(
          t.label
        )}</span></td><td style="padding:8px 12px;border:1px solid #ddd;font-family:monospace;font-size:18px"><strong>${escapeHtml(t.code)}</strong></td></tr>`
    )
    .join("")
  const html = `<!doctype html>
<html><body style="font-family:Arial,sans-serif;color:#111">
<h2>Your tickets</h2>
<p>${hello}</p>
<p>Here ${data.tickets.length === 1 ? "is your ticket" : `are your ${data.tickets.length} tickets`}${
    data.order_display_id ? ` for order #${data.order_display_id}` : ""
  }. Show the code at the door; each code lets one person in once.</p>
<table style="border-collapse:collapse">${rows}</table>
</body></html>`
  return {
    subject: data.tickets.length === 1 ? "Your ticket" : `Your ${data.tickets.length} tickets`,
    html,
  }
}
