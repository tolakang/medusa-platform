import {
  createInstantSearchAdapter,
  type MedusaSdkLike,
} from "@medusajs/instantsearch-adapter"

import { sdk } from "@lib/config"

export const PRODUCT_INDEX_NAME = "product"

/**
 * The currencies the product index holds prices in, one field set each. Keep
 * in sync with `PRICE_CURRENCIES` in the backend's `src/search/product.ts`.
 */
export const SEARCH_PRICE_CURRENCIES = ["eur", "usd"]

export type PriceField =
  | "min_price"
  | "max_price"
  | "original_price"
  | "on_sale"

/**
 * The indexed currency to read prices in for a region. A region whose currency
 * the index doesn't hold falls back to the first one, so the listing still
 * shows a price rather than none.
 */
export const indexedCurrency = (currencyCode: string) => {
  const code = currencyCode.toLowerCase()
  return SEARCH_PRICE_CURRENCIES.includes(code)
    ? code
    : SEARCH_PRICE_CURRENCIES[0]
}

export const priceAttribute = (field: PriceField, currencyCode: string) =>
  `${field}_${indexedCurrency(currencyCode)}`

/**
 * Shared by the navbar search drawer and the store listing. An empty query
 * searches rather than short-circuiting, which is what the listing needs to
 * show every product before anything is refined.
 */
// After a failure the same request is not sent again for this long, so a
// widget remount can't turn one error into a request loop.
const FAILURE_HOLD_MS = 30_000
let lastFailure: { body: string; at: number; error: Error } | null = null

// In the browser, searches go through this app's own /api/search route, which
// adds the seller's publishable key for the request's domain (the build-time
// key is the owner's, and the backend's CORS doesn't list sellers' domains).
// On the server the SDK is used directly.
const browserSearch: MedusaSdkLike = {
  client: {
    fetch: async (_path, init) => {
      const body = JSON.stringify(init?.body ?? {})
      if (
        lastFailure &&
        lastFailure.body === body &&
        Date.now() - lastFailure.at < FAILURE_HOLD_MS
      ) {
        throw lastFailure.error
      }
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      })
      if (!res.ok) {
        const error = new Error(`Search failed (${res.status})`)
        lastFailure = { body, at: Date.now(), error }
        throw error
      }
      lastFailure = null
      return res.json()
    },
  },
}

export const { searchClient } = createInstantSearchAdapter({
  sdk:
    typeof window === "undefined"
      ? (sdk as unknown as MedusaSdkLike)
      : browserSearch,
  path: "/store/search",
  additionalSearchParameters: {
    search_options: {
      match_strategy: "last",
    },
  },
  // Range widgets read `facets_stats`, which the adapter only produces for
  // fields listed here. The price fields are declared with a `stats` facet on
  // the index, which is what makes the stats available at all.
  numericAttributes: SEARCH_PRICE_CURRENCIES.flatMap((currency) => [
    `min_price_${currency}`,
    `max_price_${currency}`,
  ]),
})
