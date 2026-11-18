// Extras on a booking (TASKS P3-25, plan §9.3 shared features: helpers,
// packing boxes, an extra hour, insurance). An extra is a product with
// metadata.booking_extra = true (no shipping, priced per unit); a service
// offers it when the extra's handle is in the service product's
// metadata.extras ("packing-boxes,extra-helper"). An extra is added with its
// booking: its line item's metadata.booking_extra_for is that booking's id.
// Pure helpers, unit-tested in __tests__/booking-extras.unit.spec.ts.

type Meta = Record<string, unknown> | null | undefined

export const EXTRA_FOR_KEY = "booking_extra_for"
export const MAX_EXTRA_QUANTITY = 20

export const EXTRA_NEEDS_BOOKING_MESSAGE = "Extras are added with a booking. Book the service and choose its extras there."
export const EXTRA_NOT_OFFERED_MESSAGE = "This extra isn't offered with this service."
export const EXTRA_BOOKING_REMOVED_MESSAGE = "An extra's booking is no longer in your cart. Remove the extra, or book again."
export const EXTRA_MOVED_MESSAGE = "An extra stays with the booking it was added to."

export const isExtraProduct = (product: { metadata?: Meta } | null | undefined) => product?.metadata?.booking_extra === true

/** The extra handles a service offers (its metadata.extras). */
export function offeredExtras(product: { metadata?: Meta } | null | undefined): string[] {
  const raw = product?.metadata?.extras
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : []
  return list.map((h) => String(h).trim()).filter(Boolean)
}

export const extraFor = (metadata: Meta): string | null => {
  const id = metadata?.[EXTRA_FOR_KEY]
  return typeof id === "string" && id ? id : null
}

/**
 * Why these cart lines can't stand (null = they can): every extra line must
 * name a booking whose line is in the same cart.
 */
export function extrasProblem(
  lines: { metadata?: Meta; is_extra: boolean }[],
  bookingIdsInCart: Set<string>
): string | null {
  for (const line of lines.filter((l) => l.is_extra)) {
    const id = extraFor(line.metadata)
    if (!id) {
      return EXTRA_NEEDS_BOOKING_MESSAGE
    }
    if (!bookingIdsInCart.has(id)) {
      return EXTRA_BOOKING_REMOVED_MESSAGE
    }
  }
  return null
}

// A group of event tickets that extras can go with (P3-25 follow-up): the
// ticket line's metadata carries it, each extra's EXTRA_FOR_KEY points at it.
export const TICKET_GROUP_KEY = "booking_ticket_group"
