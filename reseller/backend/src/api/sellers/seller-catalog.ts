import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"

// TASKS P5-06: what a seller may offer. "Your products" (plan §9.5) are the
// published products of your own channel, the store's default sales
// channel; the seller picks which of them show in their channel (P5-02).

export async function sellerChannelId(container: MedusaContainer, sellerId: string) {
  const {
    data: [seller],
  } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "seller",
    fields: ["id", "sales_channel.id"],
    filters: { id: sellerId },
  })
  const channelId = seller?.sales_channel?.id
  if (!channelId) {
    throw new MedusaError(
      MedusaError.Types.NOT_FOUND,
      "This seller has no sales channel. Ask the shop to set it up."
    )
  }
  return channelId
}

/** Your published products, each with whether it is in the seller's channel. */
export async function sellerCatalog(container: MedusaContainer, channelId: string) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [store],
  } = await query.graph({ entity: "store", fields: ["default_sales_channel_id"] })
  const ownChannel = store?.default_sales_channel_id
  if (!ownChannel) {
    return []
  }
  const { data: products } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "title",
      "handle",
      "thumbnail",
      "sales_channels.id",
      // The lowest price, shown in the portal's product list.
      "variants.prices.amount",
      "variants.prices.currency_code",
    ],
    filters: { status: "published" },
  })
  return products
    .filter((product) =>
      (product.sales_channels ?? []).some((channel) => channel?.id === ownChannel)
    )
    .map((product) => ({
      id: product.id,
      title: product.title,
      handle: product.handle,
      thumbnail: product.thumbnail,
      price: lowestPrice(product.variants as unknown as Parameters<typeof lowestPrice>[0]),
      selected: (product.sales_channels ?? []).some((channel) => channel?.id === channelId),
    }))
    .sort((a, b) => a.title.localeCompare(b.title))
}

type PriceRow = { amount?: unknown; currency_code?: string | null } | null
/** The lowest variant price, in the first currency found; null without one. */
export function lowestPrice(
  variants: ({ prices?: PriceRow[] | null } | null)[] | null | undefined
): { amount: number; currency_code: string } | null {
  const prices = (variants ?? []).flatMap((v) => v?.prices ?? []).filter(
    (p): p is { amount: unknown; currency_code: string } => !!p?.currency_code && p.amount != null
  )
  const currency = prices[0]?.currency_code
  if (!currency) {
    return null
  }
  const amounts = prices.filter((p) => p.currency_code === currency).map((p) => Number(p.amount))
  return { amount: Math.min(...amounts), currency_code: currency }
}
