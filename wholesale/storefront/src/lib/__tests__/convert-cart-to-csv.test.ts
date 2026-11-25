import assert from "node:assert/strict"
import { test } from "node:test"
import { cartToCsv, csvField } from "../util/convert-cart-to-csv.ts"

test("quotes per RFC 4180 and guards formulas", () => {
  assert.equal(csvField('Bolt "M8", zinc'), '"Bolt ""M8"", zinc"')
  assert.equal(csvField("=HYPERLINK(1)"), "'=HYPERLINK(1)")
  assert.equal(csvField("+1"), "'+1")
  assert.equal(csvField("-x"), "'-x")
  assert.equal(csvField("@x"), "'@x")
  assert.equal(csvField(null), "")
  assert.equal(csvField(undefined), "")
  assert.equal(csvField(-5), "-5")
})

test("tax rate is a percent, currency column, no null description", () => {
  const csv = cartToCsv({
    currency_code: "eur",
    items: [
      {
        id: "item_1",
        variant_id: "var_1",
        product_title: "Bolt",
        product_description: null,
        variant_sku: "B-1",
        variant_title: "M8",
        quantity: 10,
        unit_price: 2,
        tax_lines: [{ rate: 20 }],
      },
    ],
  } as never)
  const [header, row] = csv.split("\r\n")
  assert.ok(header.includes("Currency"))
  assert.equal(row, "item_1,var_1,Bolt,,B-1,M8,10,EUR,2.00,20.00,20.00,4.00")
})
