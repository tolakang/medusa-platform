import { strict as assert } from "node:assert"
import { describe, it } from "node:test"
import { saleAmount, saleStatusLabel, shopUrl } from "../format.ts"

describe("sale labels (role test 2026-11-25)", () => {
  it("says refunded instead of Placed $0.00", () => {
    assert.equal(saleStatusLabel({ status: "pending", total: 0, paid_total: 20, refunded_total: 20 }), "Refunded")
    assert.equal(saleStatusLabel({ status: "pending", total: 12, paid_total: 20, refunded_total: 8 }), "Partly refunded")
    assert.equal(saleStatusLabel({ status: "pending", total: 20, paid_total: 20, refunded_total: 0 }), "Placed")
    assert.equal(saleStatusLabel({ status: "canceled", total: 20 }), "Cancelled")
    assert.equal(saleAmount({ status: "pending", total: 0, paid_total: 20 }), 20)
    assert.equal(saleAmount({ status: "pending", total: 15 }), 15)
  })

  it("builds the shop link from the domain", () => {
    assert.equal(shopUrl("shop.sok.com"), "https://shop.sok.com")
    assert.equal(shopUrl(null), null)
  })
})
