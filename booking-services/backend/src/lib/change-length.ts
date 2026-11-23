import { MathBN } from "@medusajs/framework/utils"

// Changing a paid rental's dates or a trip's hours (owner, 2026-11-23:
// "refund the difference"; the balance stays at the venue). Pure parts.

export const CHANGE_NOT_ALLOWED_MESSAGE = "Only a rental's dates or a trip's hours can be changed this way."
export const CHANGE_FREE_MESSAGE = "This booking was paid with a pass or is part of a package; move it instead."
export const CHANGE_SAME_MESSAGE = "That's the booking's length already."

const cents = (v: unknown) => MathBN.convert((v ?? 0) as number, 2).toNumber()

/** The money side: a refund (now paid more than the new price) or a balance due. */
export function priceChange(paid: unknown, newPrice: unknown): { refund: number; due: number } {
  const diff = cents(MathBN.sub(cents(newPrice), cents(paid)))
  return diff < 0 ? { refund: -diff, due: 0 } : { refund: 0, due: diff }
}
