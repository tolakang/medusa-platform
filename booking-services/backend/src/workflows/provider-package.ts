import type { LinkDefinition } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules, ProductStatus } from "@medusajs/framework/utils"
import { createStep, createWorkflow, transform, StepResponse, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { createProductsWorkflow, createRemoteLinkStep } from "@medusajs/medusa/core-flows"
import { BOOKING_MODULE } from "../modules/booking"
import { SHOP_NOT_READY_MESSAGE } from "./provider-service"

// TASKS P3-30 (plan §9.3: partners build "packages from their own pieces"):
// a partner's event package is a product with package_items naming their own
// service lengths by variant id, a time on the event day each, at one price.
// It is linked to the partner like their services; the shop books it the
// same way as its own packages (all pieces or none).
export const NOT_YOUR_SERVICE_MESSAGE = "Each part must be one of your own services."

export type CreateProviderPackageInput = {
  provider_id: string
  title: string
  description?: string | null
  price: number
  pieces: { variant_id: string; day: number; time: string; label?: string | null }[]
}

const packageContextStep = createStep("package-context", async (input: CreateProviderPackageInput, { container }) => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [provider],
  } = await query.graph({ entity: "booking_provider", fields: ["id", "products.variants.id"], filters: { id: input.provider_id } })
  const own = new Set(((provider as { products?: { variants?: { id: string }[] }[] } | undefined)?.products ?? []).flatMap((p) => (p?.variants ?? []).map((v) => v.id)))
  if (!input.pieces.every((p) => own.has(p.variant_id))) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, NOT_YOUR_SERVICE_MESSAGE)
  }
  const {
    data: [store],
  } = await query.graph({ entity: "store", fields: ["default_sales_channel_id", "supported_currencies.currency_code", "supported_currencies.is_default"] })
  const currencies = store?.supported_currencies ?? []
  const currency = (currencies.find((c) => c?.is_default) ?? currencies[0])?.currency_code
  if (!store?.default_sales_channel_id || !currency) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, SHOP_NOT_READY_MESSAGE)
  }
  return new StepResponse({ sales_channel_id: store.default_sales_channel_id, currency_code: currency })
})

export const createProviderPackageWorkflow = createWorkflow("create-provider-package", function (input: CreateProviderPackageInput) {
  const context = packageContextStep(input)
  const products = createProductsWorkflow.runAsStep({
    input: transform({ input, context }, ({ input, context }) => ({
      products: [
        {
          title: input.title.trim(),
          description: input.description?.trim() || undefined,
          status: ProductStatus.PUBLISHED,
          // No shipping profile: nothing is shipped.
          metadata: {
            package_items: input.pieces.map((p) => ({
              variant_id: p.variant_id,
              day: p.day,
              time: p.time,
              ...(p.label?.trim() ? { label: p.label.trim() } : {}),
            })),
          },
          options: [{ title: "Package", values: [input.title.trim()] }],
          sales_channels: [{ id: context.sales_channel_id }],
          variants: [
            {
              title: input.title.trim(),
              manage_inventory: false,
              options: { Package: input.title.trim() },
              prices: [{ amount: input.price, currency_code: context.currency_code }],
            },
          ],
        },
      ],
    })),
  })
  createRemoteLinkStep(
    transform({ products, input }, ({ products, input }): LinkDefinition[] => [
      { [BOOKING_MODULE]: { booking_provider_id: input.provider_id }, [Modules.PRODUCT]: { product_id: products[0].id } },
    ])
  )
  return new WorkflowResponse(transform({ products }, ({ products }) => products[0]))
})
