import { strict as assert } from "node:assert"
import { describe, it } from "node:test"
import { clearSale, loadSale, saleIdentity, saleKey, saveSale, type SavedSale } from "../sale-store.ts"

function memory() {
  const m = new Map<string, string>()
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  }
}

const line = { variant_id: "v1", title: "Shirt", variant_title: null, sku: null, unit_price: 10, quantity: 2 }
const sale: SavedSale = {
  cart: [line],
  customer: null,
  promo: "",
  saleRef: "ref-1",
  uncertain: { method: "cash", tendered: 50 },
  preview: { currency_code: "usd", subtotal: 20, discount_total: 0, tax_total: 0, total: 20 },
}

describe("sale store", () => {
  it("keeps the unsure-sale lock and its ref across a reload", () => {
    const s = memory()
    saveSale("sh_1", sale, s)
    assert.deepEqual(loadSale("sh_1", s), sale)
    assert.equal(loadSale("sh_2", s), null)
  })

  it("removes an empty settled sale and clears on demand", () => {
    const s = memory()
    saveSale("sh_1", sale, s)
    saveSale("sh_1", { ...sale, cart: [], uncertain: null }, s)
    assert.equal(s.m.has(saleKey("sh_1")), false)
    saveSale("sh_1", sale, s)
    clearSale("sh_1", s)
    assert.equal(loadSale("sh_1", s), null)
  })

  it("ignores broken or throwing storage", () => {
    const s = memory()
    s.m.set(saleKey("sh_1"), "{not json")
    assert.equal(loadSale("sh_1", s), null)
    const throwing = { getItem: () => { throw new Error("x") }, setItem: () => { throw new Error("x") }, removeItem: () => { throw new Error("x") } }
    assert.equal(loadSale("sh_1", throwing), null)
    saveSale("sh_1", sale, throwing)
    clearSale("sh_1", throwing)
  })

  it("identifies a sale by lines, customer and promo", () => {
    assert.equal(saleIdentity([line], null, "A "), saleIdentity([{ ...line, title: "x" }], null, "A"))
    assert.notEqual(saleIdentity([line], null, ""), saleIdentity([{ ...line, quantity: 3 }], null, ""))
  })
})
