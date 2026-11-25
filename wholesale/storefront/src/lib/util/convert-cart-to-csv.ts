import type { B2BCart } from "@/types/global"
import type { HttpTypes } from "@medusajs/types"

// RFC 4180: a field with a comma, quote or line break is quoted, and quotes
// inside are doubled. A text field starting with = + - @ (or a tab / carriage
// return) is prefixed with ' so a spreadsheet doesn't run it as a formula
// (CSV injection). Missing text is empty, not "null"/"undefined".
export function csvField(value: unknown): string {
  if (value === null || value === undefined) {
    return ""
  }
  let text = String(value)
  if (typeof value !== "number" && /^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`
  }
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

// The cart's items as CSV. Amounts are in the cart's currency (major units,
// as Medusa v2 stores them); the tax rate is a percent as Medusa gives it.
export function cartToCsv(cart: B2BCart) {
  const currency = (cart.currency_code ?? "").toUpperCase()

  const header = [
    "Item ID",
    "Variant ID",
    "Product Title",
    "Product Description",
    "Variant SKU",
    "Variant Title",
    "Quantity",
    "Currency",
    "Unit Price",
    "Tax Rate (%)",
    "Total Price",
    "Total Tax",
  ]

  const rows = (cart.items ?? []).map((item: HttpTypes.StoreCartLineItem) => {
    // Medusa tax line rates are percents (20 = 20%).
    const taxRate = Number(item.tax_lines?.[0]?.rate ?? 0)
    const unitPrice = Number(item.unit_price ?? 0)
    const totalPrice = item.quantity * unitPrice
    const totalTax = (totalPrice * taxRate) / 100

    return [
      item.id,
      item.variant_id,
      item.product_title,
      item.product_description?.replace(/\s*\n\s*/g, " "),
      item.variant_sku,
      item.variant_title,
      item.quantity,
      currency,
      unitPrice.toFixed(2),
      taxRate.toFixed(2),
      totalPrice.toFixed(2),
      totalTax.toFixed(2),
    ]
      .map(csvField)
      .join(",")
  })

  return [header.map(csvField).join(","), ...rows].join("\r\n")
}
