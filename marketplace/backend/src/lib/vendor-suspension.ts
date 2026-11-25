import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import type { MedusaContainer, SearchTypes } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import {
  createSalesChannelsWorkflow,
  linkProductsToSalesChannelWorkflow,
} from "@medusajs/medusa/core-flows"

// A suspended vendor's products leave the store (bug 2026-11-25: the shop page
// 404'd but its products stayed buyable). Vendor products always live in the
// store's default sales channel (POST /vendors/products), so suspending takes
// them out of it and re-activating puts them back
// (linkProductsToSalesChannelWorkflow, core-flows sales-channel/workflows/
// link-products-to-sales-channel.d.ts: { id, add, remove }). The store's
// product routes and the search index only show a key's channels; linking
// emits no event, so the product index is rebuilt (MEDUSA_SKILL F-102).
// Carts that already hold one are refused at add-to-cart and checkout by
// refuseSuspendedVendorItems.

export const SUSPENDED_VENDOR_ITEM_MESSAGE =
  "A product in your cart is from a shop that is no longer selling. Remove it to continue."

export async function setVendorProductsOnSale(
  container: MedusaContainer,
  vendorId: string,
  onSale: boolean
) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [vendor],
  } = await query.graph({ entity: "vendor", fields: ["products.id"], filters: { id: vendorId } })
  const productIds = (vendor?.products ?? []).map((p) => p!.id)
  const {
    data: [store],
  } = await query.graph({ entity: "store", fields: ["default_sales_channel_id"] })
  const channelId = store?.default_sales_channel_id
  if (!productIds.length || !channelId) {
    return
  }
  // Medusa skips the sales-channel filter on GET /store/products while the
  // store has only one channel (@medusajs/medusa dist/api/store/products/
  // middlewares.js applyMaybeLinkFilterIfNecessary: salesChannelCount > 1).
  // So the products move to a disabled "Suspended vendors" channel instead of
  // to none: there are then always two channels and the filter applies.
  const parkingId = await suspendedChannelId(container)
  await linkProductsToSalesChannelWorkflow(container).run({
    input: { id: channelId, ...(onSale ? { add: productIds } : { remove: productIds }) },
  })
  await linkProductsToSalesChannelWorkflow(container)
    .run({
      input: { id: parkingId, ...(onSale ? { remove: productIds } : { add: productIds }) },
    })
  try {
    await container
      .resolve<SearchTypes.ISearchModuleService>(Modules.SEARCH)
      .reindex({ index: "product" })
  } catch (error) {
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn(`Product search index not rebuilt: ${(error as Error).message}`)
  }
}

export const SUSPENDED_CHANNEL_NAME = "Suspended vendors"

/** The disabled channel that holds suspended vendors' products, created once. */
async function suspendedChannelId(container: MedusaContainer): Promise<string> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [existing],
  } = await query.graph({
    entity: "sales_channel",
    fields: ["id"],
    filters: { name: SUSPENDED_CHANNEL_NAME },
  })
  if (existing) {
    return existing.id
  }
  const { result } = await createSalesChannelsWorkflow(container).run({
    input: {
      salesChannelsData: [
        {
          name: SUSPENDED_CHANNEL_NAME,
          description: "Products of suspended vendors (not on sale). Don't link a key to it.",
          is_disabled: true,
        },
      ],
    },
  })
  return result[0].id
}

/** Variant ids (of these) whose product belongs to a suspended vendor. */
export async function suspendedVariantIds(container: MedusaContainer, variantIds: string[]) {
  if (!variantIds.length) {
    return []
  }
  const { data: variants } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "product_variant",
    fields: ["id", "product.vendor.status"],
    filters: { id: variantIds },
  })
  return variants
    .filter((v) => (v.product as { vendor?: { status?: string } } | undefined)?.vendor?.status === "suspended")
    .map((v) => v.id)
}

/**
 * Store middleware: POST /store/carts/:id/line-items refuses a suspended
 * vendor's variant; checkout (/complete, /complete-vendor) refuses a cart
 * that still holds one.
 */
export async function refuseSuspendedVendorItems(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) {
  try {
    let variantIds: string[] = []
    const body = req.body as { variant_id?: unknown } | undefined
    if (req.path.endsWith("/line-items")) {
      variantIds = typeof body?.variant_id === "string" ? [body.variant_id] : []
    } else {
      const {
        data: [cart],
      } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
        entity: "cart",
        fields: ["items.variant_id"],
        filters: { id: req.params.id },
      })
      variantIds = (cart?.items ?? []).map((i) => i?.variant_id).filter(Boolean) as string[]
    }
    if ((await suspendedVariantIds(req.scope, variantIds)).length) {
      return next(new MedusaError(MedusaError.Types.NOT_ALLOWED, SUSPENDED_VENDOR_ITEM_MESSAGE))
    }
    next()
  } catch (error) {
    next(error)
  }
}
