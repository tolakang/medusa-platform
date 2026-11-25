import { MathBN } from "@medusajs/framework/utils"

// What's left to fulfil on an order read through Query (orders read that way
// have no `fulfillment_status`, MEDUSA_SKILL §6 "Query note"; count the
// order's active fulfilments instead). Pure, shared by the vendor routes and
// the payout run.

type OrderRow = Record<string, any>

/** The order fields remainingByItem and isFullyFulfilled need. */
export const FULFILLMENT_FIELDS = [
  "items.id",
  "items.quantity",
  "fulfillments.canceled_at",
  "fulfillments.items.line_item_id",
  "fulfillments.items.quantity",
]

/** Each item's quantity not yet in an active fulfilment. */
export function remainingByItem(order: OrderRow): Record<string, number> {
  const done: Record<string, ReturnType<typeof MathBN.convert>> = {}
  for (const f of order.fulfillments ?? []) {
    if (f?.canceled_at) {
      continue
    }
    for (const fi of f?.items ?? []) {
      done[fi.line_item_id] = MathBN.add(done[fi.line_item_id] ?? 0, fi.quantity)
    }
  }
  return Object.fromEntries(
    (order.items ?? []).map((i: OrderRow) => [
      i.id,
      Math.max(0, MathBN.sub(i.quantity, done[i.id] ?? 0).toNumber()),
    ])
  )
}

/** Every item of the order is in an active fulfilment (and it has items). */
export function isFullyFulfilled(order: OrderRow) {
  const remaining = Object.values(remainingByItem(order))
  return remaining.length > 0 && remaining.every((q) => q === 0)
}
