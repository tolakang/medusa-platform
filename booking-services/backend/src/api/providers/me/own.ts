import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"

// What belongs to the signed-in provider (TASKS P3-32, plan §9.3 "Ownership":
// a provider sees and changes only their own). Anything else answers "not
// found", so ids of other providers' data can't be probed.

export const PARTNERS_ONLY_MESSAGE = "Only partners manage their own hours, days off and services."

export const OWN_RESOURCE_FIELDS = [
  "id",
  "name",
  "type",
  "capacity",
  "timezone",
  "is_active",
  "schedules.weekday",
  "schedules.start_time",
  "schedules.end_time",
  "days_off.date",
]

export const OWN_SERVICE_FIELDS = [
  "id",
  "title",
  "handle",
  "description",
  "status",
  "thumbnail",
  "variants.id",
  "variants.title",
  "variants.metadata",
  "variants.prices.amount",
  "variants.prices.currency_code",
]

const graph = (scope: MedusaContainer) => scope.resolve(ContainerRegistrationKeys.QUERY)

export async function ownResources(scope: MedusaContainer, providerId: string) {
  const { data } = await graph(scope).graph({
    entity: "booking_resource",
    fields: OWN_RESOURCE_FIELDS,
    filters: { provider_id: providerId },
    pagination: { order: { name: "ASC" } },
  })
  return data
}

export async function ownResourceIds(scope: MedusaContainer, providerId: string): Promise<string[]> {
  const { data } = await graph(scope).graph({
    entity: "booking_resource",
    fields: ["id"],
    filters: { provider_id: providerId },
  })
  return data.map((r) => r.id)
}

export async function assertOwnResource(scope: MedusaContainer, providerId: string, resourceId: string) {
  if (!(await ownResourceIds(scope, providerId)).includes(resourceId)) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Calendar ${resourceId} was not found.`)
  }
}

// Hours, days off and services are a partner's own business; a staff
// member's are set by the shop's admin.
export async function assertPartner(scope: MedusaContainer, providerId: string) {
  const {
    data: [provider],
  } = await graph(scope).graph({ entity: "booking_provider", fields: ["id", "role"], filters: { id: providerId } })
  if (provider?.role !== "partner") {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, PARTNERS_ONLY_MESSAGE)
  }
}

export async function isPartner(scope: MedusaContainer, providerId: string): Promise<boolean> {
  const {
    data: [provider],
  } = await graph(scope).graph({ entity: "booking_provider", fields: ["id", "role"], filters: { id: providerId } })
  return provider?.role === "partner"
}

// The provider's services: the products linked to them
// (booking-provider-product).
export async function ownServices(scope: MedusaContainer, providerId: string, productId?: string) {
  const {
    data: [provider],
  } = await graph(scope).graph({
    entity: "booking_provider",
    fields: ["id", ...OWN_SERVICE_FIELDS.map((f) => `products.${f}`)],
    filters: { id: providerId },
  })
  type Length = { metadata?: { duration_minutes?: number } | null }
  type Service = { id: string; title?: string; variants?: Length[] } & Record<string, unknown>
  const minutes = (v: Length) => Number(v.metadata?.duration_minutes) || 0
  // By name, each with its lengths shortest first.
  const products = ((provider as { products?: Service[] } | undefined)?.products ?? [])
    .filter((p) => !!p)
    .map((p) => ({ ...p, variants: [...(p.variants ?? [])].sort((a, b) => minutes(a) - minutes(b)) }))
    .sort((a, b) => String(a.title ?? "").localeCompare(String(b.title ?? "")))
  return productId ? products.filter((p) => p.id === productId) : products
}

export async function assertOwnService(scope: MedusaContainer, providerId: string, productId: string) {
  const [service] = await ownServices(scope, providerId, productId)
  if (!service) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Service ${productId} was not found.`)
  }
  return service
}
