import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { deleteProductsWorkflow, updateProductsWorkflow } from "@medusajs/medusa/core-flows"
import { vendorIdOf } from "../../me/vendor-orders"

// Edit or delete one of the vendor's own products that isn't on sale yet (gap
// review 2026-11-24): fix a draft or a rejected product and send it for review
// again. A published product is the marketplace's to change, so it's refused.
export const PostVendorProduct = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(5000).optional(),
    status: z.enum(["draft", "proposed"]).optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: "Send title, description or status." })

export const PUBLISHED_PRODUCT_MESSAGE =
  "This product is on sale. Ask the marketplace to unpublish it before you change or delete it."

const ownProduct = async (req: AuthenticatedMedusaRequest) => {
  const vendorId = await vendorIdOf(req)
  const {
    data: [vendor],
  } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "vendor",
    fields: ["products.id", "products.status", "products.metadata"],
    filters: { id: vendorId },
  })
  const product = (vendor?.products ?? []).find((p) => p?.id === req.params.id)
  if (!product) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Product with id: ${req.params.id} was not found`)
  }
  if (product.status === "published") {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, PUBLISHED_PRODUCT_MESSAGE)
  }
  return product
}

// POST /vendors/products/:id: change the title, description or status (draft
// or proposed). Sending it for review again clears the rejection note.
export const POST = async (
  req: AuthenticatedMedusaRequest<z.infer<typeof PostVendorProduct>>,
  res: MedusaResponse
) => {
  const product = await ownProduct(req)
  const { status, ...fields } = req.validatedBody
  const metadata = { ...(product.metadata ?? {}) } as Record<string, unknown>
  if (status === "proposed") {
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

// DELETE /vendors/products/:id: remove a product that was never on sale.
export const DELETE = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const product = await ownProduct(req)
  await deleteProductsWorkflow(req.scope).run({ input: { ids: [product.id] } })
  res.json({ id: product.id, object: "product", deleted: true })
}
