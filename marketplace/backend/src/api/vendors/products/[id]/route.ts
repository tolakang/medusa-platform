import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import {
  deleteProductsWorkflow,
  updateProductsWorkflow,
  updateProductVariantsWorkflow,
} from "@medusajs/medusa/core-flows"
import { assertSellableCurrencies } from "../../../../lib/sellable-currencies"
import { productApprovalRequired, vendorProductStatus } from "../../../../lib/vendor-product-status"
import { vendorIdOf } from "../../me/vendor-orders"

// Edit or delete one of the vendor's own products (gap review 2026-11-24): fix
// a draft or a rejected product and send it for review again. The price
// (amount and currency) and SKU of its variant(s) can change too (bug
// 2026-11-25: after a "price it in USD" rejection the vendor couldn't). A
// published product can be edited; with approval required, the edit takes it
// off sale and back to review (`proposed`). Only an unpublished product can be
// deleted.
export const PostVendorProduct = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(5000).optional(),
    status: z.enum(["draft", "proposed", "published"]).optional(),
    price: z
      .object({
        amount: z.number().positive().max(1_000_000_000),
        currency_code: z.string().regex(/^[a-zA-Z]{3}$/),
      })
      .strict()
      .optional(),
    sku: z.string().trim().max(120).nullable().optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, {
    message: "Send title, description, status, price or sku.",
  })

export const PUBLISHED_PRODUCT_MESSAGE =
  "This product is on sale. Ask the marketplace to unpublish it before you delete it."

const ownProduct = async (req: AuthenticatedMedusaRequest) => {
  const vendorId = await vendorIdOf(req)
  const {
    data: [vendor],
  } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "vendor",
    fields: ["products.id", "products.status", "products.metadata", "products.variants.id"],
    filters: { id: vendorId },
  })
  const product = (vendor?.products ?? []).find((p) => p?.id === req.params.id)
  if (!product) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Product with id: ${req.params.id} was not found`)
  }
  return product
}

// POST /vendors/products/:id: change the title, description or status (draft
// or proposed; published too when MARKETPLACE_REQUIRE_PRODUCT_APPROVAL is
// off, as on create: vendorProductStatus). Sending it for review again, or
// publishing it, clears the rejection note.
export const POST = async (
  req: AuthenticatedMedusaRequest<z.infer<typeof PostVendorProduct>>,
  res: MedusaResponse
) => {
  const product = await ownProduct(req)
  const { status: requested, price, sku, ...fields } = req.validatedBody
  const approval = productApprovalRequired()
  let status =
    requested === undefined ? undefined : vendorProductStatus(requested, approval)
  // A change to a product on sale goes back to review when approval is on.
  if (product.status === "published" && approval && status !== "draft") {
    status = "proposed"
  }
  if (price) {
    await assertSellableCurrencies(req.scope, [price.currency_code])
  }
  const variantIds = (product.variants ?? []).map((v) => v!.id)
  if ((price || sku !== undefined) && variantIds.length) {
    await updateProductVariantsWorkflow(req.scope).run({
      input: {
        selector: { id: variantIds },
        update: {
          ...(sku !== undefined && variantIds.length === 1 ? { sku: sku || null } : {}),
          ...(price
            ? {
                prices: [
                  { amount: price.amount, currency_code: price.currency_code.toLowerCase() },
                ],
              }
            : {}),
        },
      },
    })
  }
  const metadata = { ...(product.metadata ?? {}) } as Record<string, unknown>
  if (status === "proposed" || status === "published") {
    delete metadata.rejection_note
  }
  await updateProductsWorkflow(req.scope).run({
    input: {
      selector: { id: product.id },
      update: { ...fields, ...(status ? { status } : {}), metadata },
    },
  })
  res.json({ product: { id: product.id, ...fields, status: status ?? product.status } })
}

// DELETE /vendors/products/:id: remove a product that isn't on sale.
export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const product = await ownProduct(req)
  if (product.status === "published") {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, PUBLISHED_PRODUCT_MESSAGE)
  }
  await deleteProductsWorkflow(req.scope).run({ input: { ids: [product.id] } })
  res.json({ id: product.id, object: "product", deleted: true })
}
