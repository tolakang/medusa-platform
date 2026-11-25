// The sale in progress, kept in the browser per shift so a reload doesn't
// lose the cart, or the "sale may already be recorded" lock and its
// client_ref (double-charge risk). Kept free of React for unit tests.

import type { CartLine } from "./cart.ts"

export type SavedSale = {
  cart: CartLine[]
  customer: { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null } | null
  promo: string
  saleRef: string
  uncertain: { method: "cash" | "card" | "qr"; tendered: number | null } | null
  preview: { currency_code: string; subtotal: number; discount_total: number; tax_total: number; total: number } | null
}

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">

export const saleKey = (shiftId: string) => `pos.sale.${shiftId}`

// What makes two tries "the same sale": same lines, customer and promo.
export function saleIdentity(cart: CartLine[], customerId: string | null, promo: string): string {
  return JSON.stringify([cart.map((l) => [l.variant_id, l.quantity]), customerId, promo.trim()])
}

function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage
  } catch {
    return null
  }
}

export function loadSale(shiftId: string, s: Storage | null = store()): SavedSale | null {
  try {
    const raw = s?.getItem(saleKey(shiftId))
    if (!raw) return null
    const sale = JSON.parse(raw) as SavedSale
    return Array.isArray(sale?.cart) && typeof sale.saleRef === "string" ? sale : null
  } catch {
    return null
  }
}

// An empty, settled sale is removed instead of saved.
export function saveSale(shiftId: string, sale: SavedSale, s: Storage | null = store()): void {
  try {
    if (!sale.cart.length && !sale.uncertain && !sale.customer && !sale.promo) {
      s?.removeItem(saleKey(shiftId))
    } else {
      s?.setItem(saleKey(shiftId), JSON.stringify(sale))
    }
  } catch {
    // Private mode or full storage: the sale lives in memory only.
  }
}

export function clearSale(shiftId: string, s: Storage | null = store()): void {
  try {
    s?.removeItem(saleKey(shiftId))
  } catch {
    // ignore
  }
}
