import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import type { MedusaContainer } from "@medusajs/framework/types"

// Quote fields shared by the store and admin routes (TASKS P3-27).
export const QUOTE_FIELDS = [
  "id",
  "customer_id",
  "variant_id",
  "details",
  "address",
  "dropoff_address",
  "wished_starts_at",
  "status",
  "amount",
  "currency_code",
  "resource_id",
  "starts_at",
  "ends_at",
  "reply",
  "valid_until",
  "booking_id",
  "created_at",
]

// Quotes with their service title, newest first; a priced quote past its
// date reads "expired".
export async function listQuotes(scope: MedusaContainer, filters: Record<string, unknown>) {
  const query = scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "booking_quote", fields: QUOTE_FIELDS, filters })
  const variantIds = [...new Set(data.map((q) => q.variant_id))]
  const { data: variants } = variantIds.length
    ? await query.graph({ entity: "product_variant", fields: ["id", "title", "product.title"], filters: { id: variantIds } })
    : { data: [] }
  const titles = new Map(variants.map((v) => [v.id, v.product?.title ?? v.title]))
  // Each quote's time zone, its calendar's (or the shop's), so the times
  // show in local time on the server and in the browser alike.
  const resourceIds = [...new Set(data.map((q) => q.resource_id).filter(Boolean) as string[])]
  const { data: resources } = resourceIds.length
    ? await query.graph({ entity: "booking_resource", fields: ["id", "timezone"], filters: { id: resourceIds } })
    : { data: [] as { id: string; timezone: string }[] }
  const zones = new Map((resources as { id: string; timezone: string }[]).map((r) => [r.id, r.timezone]))
  const shopZone = process.env.BOOKING_DEFAULT_TIMEZONE || "UTC"
  const now = Date.now()
  return data
    .map((q) => ({
      ...q,
      amount: q.amount === null || q.amount === undefined ? null : Number(q.amount),
      status: q.status === "quoted" && q.valid_until && new Date(q.valid_until).getTime() < now ? "expired" : q.status,
      service: titles.get(q.variant_id) ?? null,
      timezone: (q.resource_id && zones.get(q.resource_id)) || shopZone,
    }))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}
