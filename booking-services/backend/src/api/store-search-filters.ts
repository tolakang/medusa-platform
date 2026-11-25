import type { MedusaStoreRequest } from "@medusajs/framework/http"
import type { SearchTypes } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { isExtraProduct } from "../lib/booking-extras"

// Extras (metadata.booking_extra, TASKS P3-25) are sold only with a booking,
// so /store/search never lists them as services. configureStoreSearch ANDs
// this resolver's filters onto every product query (@medusajs/framework
// dist/http/middlewares/configure-store-search.d.ts `StoreSearchIndexConfig`;
// operators from @medusajs/types dist/search/filters.d.ts `$nin`). The
// product index comes from the shared core, so the filter goes by id rather
// than a new index field (no index change, no re-seed). A booking shop has a
// small catalog, so reading id + metadata per search is cheap and never stale.
export async function extraProductIds(req: MedusaStoreRequest): Promise<string[]> {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "product", fields: ["id", "metadata"] })
  return (data as { id: string; metadata?: Record<string, unknown> | null }[])
    .filter(isExtraProduct)
    .map((p) => p.id)
}

export async function hideExtrasFilter(req: MedusaStoreRequest): Promise<SearchTypes.SearchFilters> {
  const ids = await extraProductIds(req)
  return ids.length ? { id: { $nin: ids } } : {}
}
