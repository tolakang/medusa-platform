"use server"

import { sdk } from "@/lib/config"
import { getAuthHeaders, getCacheOptions } from "@/lib/data/cookies"

export type PriceTier = {
  min_quantity: number
  max_quantity: number | null
  amount: number
}

export type VariantPriceTiers = {
  variant_id: string
  currency_code: string
  tiers: PriceTier[]
}

// GET /store/price-tiers (wholesale backend, polish 2026-11-25): the
// signed-in buyer's quantity price breaks per variant. Optional extra: on
// any error the page just shows no breaks.
export const listPriceTiers = async (
  variantIds: string[],
  regionId: string
): Promise<VariantPriceTiers[]> => {
  if (!variantIds.length || !regionId) return []

  try {
    const { price_tiers } = await sdk.client.fetch<{
      price_tiers: VariantPriceTiers[]
    }>(`/store/price-tiers`, {
      method: "GET",
      query: { region_id: regionId, variant_id: variantIds.slice(0, 50).join(",") },
      headers: { ...(await getAuthHeaders()) },
      next: { ...(await getCacheOptions("products")) },
      credentials: "include",
    })
    return price_tiers ?? []
  } catch {
    return []
  }
}
