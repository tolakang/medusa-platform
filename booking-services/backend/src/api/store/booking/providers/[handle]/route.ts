import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"

// GET /store/booking/providers/:handle (TASKS P3-32, plan §9.3 "Public
// provider page"): an approved partner's public page: name, photo, bio,
// area and their published services in this key's sales channels. Staff,
// pending and suspended partners answer 404, so an unapproved partner shows
// nothing in the shop. No email, phone or rate (public data only).
export const GET = async (req: MedusaStoreRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [provider],
  } = await query.graph({
    entity: "booking_provider",
    fields: ["id", "role", "status", "handle", "name", "bio", "photo", "area", "products.id"],
    filters: { handle: req.params.handle },
  })
  if (!provider || provider.role !== "partner" || provider.status !== "active") {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Provider ${req.params.handle} was not found.`)
  }
  const ids = (provider.products ?? []).map((p) => p?.id).filter((id): id is string => !!id)
  const channels = req.publishable_key_context?.sales_channel_ids ?? []
  const { data: products } = ids.length
    ? await query.graph({
        entity: "product",
        fields: ["id", "handle", "title", "description", "thumbnail", "sales_channels.id"],
        filters: { id: ids, status: "published" },
      })
    : { data: [] }
  const services = products
    .filter((p) => !channels.length || (p.sales_channels ?? []).some((c) => c && channels.includes(c.id)))
    .map(({ sales_channels: _, ...p }) => p)
    .sort((a, b) => a.title.localeCompare(b.title))
  const { id: _id, role: _role, status: _status, products: _products, ...page } = provider
  res.json({ provider: { ...page, services } })
}
