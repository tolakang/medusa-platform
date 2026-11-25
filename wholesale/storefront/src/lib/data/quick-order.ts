"use server"

import { sdk } from "@/lib/config"
import { addToCartBulk } from "@/lib/data/cart"
import { getAuthHeaders } from "@/lib/data/cookies"
import { listPriceTiers } from "@/lib/data/price-tiers"
import { getRegion } from "@/lib/data/regions"
import { nextBreak } from "@/lib/util/price-tiers"
import {
  MAX_QUICK_ORDER_LINES,
  QuickOrderLine,
} from "@/lib/util/parse-quick-order"
import { HttpTypes } from "@medusajs/types"

export type QuickOrderHint = {
  sku: string
  min_quantity: number
  saving_per_unit: number
  currency_code: string
}

export type QuickOrderResult = {
  added: number
  not_found: string[]
  error?: string
  // "Save €x each at 10+" for lines just below a cheaper quantity tier.
  hints?: QuickOrderHint[]
}

// Quick order (BUILD_PLAN.md §9.4): finds the variants by SKU in the shop's
// own catalog (`variants.sku` filter of GET /store/products) and adds them to
// the cart in one request. The backend's cart rules still decide.
export async function addBySku(
  lines: QuickOrderLine[],
  countryCode: string
): Promise<QuickOrderResult> {
  if (!lines.length) {
    return { added: 0, not_found: [], error: "Enter at least one SKU." }
  }
  if (lines.length > MAX_QUICK_ORDER_LINES) {
    return {
      added: 0,
      not_found: [],
      error: `Add at most ${MAX_QUICK_ORDER_LINES} different SKUs at a time.`,
    }
  }

  let products: HttpTypes.StoreProduct[]
  try {
    ;({ products } = await sdk.client.fetch<HttpTypes.StoreProductListResponse>(
      `/store/products`,
      {
        method: "GET",
        query: {
          // The backend matches SKUs exactly, so also ask for the
          // upper-case spelling of what the buyer typed.
          variants: {
            sku: [
              ...new Set(
                lines.flatMap((line) => [line.sku, line.sku.toUpperCase()])
              ),
            ],
          },
          fields: "id,variants.id,variants.sku",
          limit: MAX_QUICK_ORDER_LINES * 2,
        },
        headers: { ...(await getAuthHeaders()) },
      }
    ))
  } catch (e) {
    return {
      added: 0,
      not_found: [],
      error: (e as Error)?.message || "Could not look up the SKUs.",
    }
  }

  const variantBySku = new Map<string, string>()
  for (const product of products) {
    for (const variant of product.variants ?? []) {
      if (variant.sku) {
        variantBySku.set(variant.sku.toLowerCase(), variant.id)
      }
    }
  }

  const found = lines.filter((line) => variantBySku.has(line.sku.toLowerCase()))
  const not_found = lines
    .filter((line) => !variantBySku.has(line.sku.toLowerCase()))
    .map((line) => line.sku)

  if (!found.length) {
    return { added: 0, not_found }
  }

  const { error } = await addToCartBulk({
    lineItems: found.map((line) => ({
      variant_id: variantBySku.get(line.sku.toLowerCase())!,
      quantity: line.quantity,
    })),
    countryCode,
  })

  if (error) {
    return { added: 0, not_found, error }
  }

  return { added: found.length, not_found, hints: await hintsFor(found, variantBySku, countryCode) }
}

// Polish 2026-11-25: optional, so any failure only drops the hints.
async function hintsFor(
  lines: QuickOrderLine[],
  variantBySku: Map<string, string>,
  countryCode: string
): Promise<QuickOrderHint[]> {
  try {
    const region = await getRegion(countryCode)
    if (!region) return []
    const tiers = await listPriceTiers(
      [...new Set(lines.map((l) => variantBySku.get(l.sku.toLowerCase())!))],
      region.id
    )
    return lines.flatMap((line) => {
      const entry = tiers.find(
        (t) => t.variant_id === variantBySku.get(line.sku.toLowerCase())
      )
      const hint = entry && nextBreak(entry.tiers, line.quantity)
      return hint
        ? [
            {
              sku: line.sku,
              min_quantity: hint.tier.min_quantity,
              saving_per_unit: hint.savingPerUnit,
              currency_code: entry.currency_code,
            },
          ]
        : []
    })
  } catch {
    return []
  }
}
