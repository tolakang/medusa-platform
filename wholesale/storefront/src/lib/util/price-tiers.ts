import type { PriceTier } from "@/lib/data/price-tiers"

/** "1–9", "10+" */
export const tierRange = (tier: PriceTier) =>
  tier.max_quantity == null
    ? `${tier.min_quantity}+`
    : tier.max_quantity === tier.min_quantity
    ? `${tier.min_quantity}`
    : `${tier.min_quantity}–${tier.max_quantity}`

/** The tier a quantity falls in. */
export const tierFor = (tiers: PriceTier[], quantity: number) =>
  tiers.find(
    (t) =>
      quantity >= t.min_quantity &&
      (t.max_quantity == null || quantity <= t.max_quantity)
  )

/**
 * The next cheaper tier above `quantity`, with the saving per unit, for a
 * "save €x each at 10+" hint. Null when there is none.
 */
export const nextBreak = (tiers: PriceTier[], quantity: number) => {
  const current = tierFor(tiers, quantity)
  if (!current) return null
  const next = tiers.find(
    (t) => t.min_quantity > quantity && t.amount < current.amount
  )
  return next ? { tier: next, savingPerUnit: current.amount - next.amount } : null
}

/** Same breaks for every variant? Then the page shows them once. */
export const sameTiers = (a: PriceTier[], b: PriceTier[]) =>
  a.length === b.length &&
  a.every(
    (t, i) =>
      t.min_quantity === b[i].min_quantity &&
      t.max_quantity === b[i].max_quantity &&
      t.amount === b[i].amount
  )
