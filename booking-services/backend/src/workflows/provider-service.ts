import type { LinkDefinition } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules, ProductStatus } from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { createProductsWorkflow, createRemoteLinkStep } from "@medusajs/medusa/core-flows"
import { BOOKING_MODULE } from "../modules/booking"

// A partner's own service (TASKS P3-32, plan §9.3 kind A and "Ownership"):
// a product without a shipping profile whose variants are lengths
// (metadata.duration_minutes, manage_inventory off), as the shop's own
// services (README "Services and tickets", P3-12). It is linked to its
// provider (booking-provider-product) and each length to the partner's
// calendars (booking-resource-product-variant), so its times are the
// partner's own.

export const APPOINTMENTS_CATEGORY_HANDLE = "appointments"
export const NO_CALENDAR_MESSAGE = "You have no calendar yet. Ask the shop to add one."
export const SHOP_NOT_READY_MESSAGE = "The shop isn't set up for services yet (sales channel or currency missing)."

export type ServiceLength = { minutes: number; price: number }

export type CreateProviderServiceInput = {
  provider_id: string
  title: string
  description?: string | null
  lengths: ServiceLength[]
}

export const lengthLabel = (minutes: number) => `${minutes} min`

// Where a partner's service goes: the store's default sales channel and
// currency, the Appointments category if the shop has it, and the partner's
// calendars.
const serviceContextStep = createStep("service-context", async (providerId: string, { container }) => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [store],
  } = await query.graph({
    entity: "store",
    fields: ["default_sales_channel_id", "supported_currencies.currency_code", "supported_currencies.is_default"],
  })
  const currencies = store?.supported_currencies ?? []
  const currency = (currencies.find((c) => c?.is_default) ?? currencies[0])?.currency_code
  if (!store?.default_sales_channel_id || !currency) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, SHOP_NOT_READY_MESSAGE)
  }
  const {
    data: [category],
  } = await query.graph({
    entity: "product_category",
    fields: ["id"],
    filters: { handle: APPOINTMENTS_CATEGORY_HANDLE },
  })
  const { data: resources } = await query.graph({
    entity: "booking_resource",
    fields: ["id"],
    filters: { provider_id: providerId },
  })
  if (!resources.length) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, NO_CALENDAR_MESSAGE)
  }
  return new StepResponse({
    sales_channel_id: store.default_sales_channel_id,
    currency_code: currency,
    category_id: category?.id ?? null,
    resource_ids: resources.map((r) => r.id),
  })
})

export const createProviderServiceWorkflow = createWorkflow(
  "create-provider-service",
  function (input: CreateProviderServiceInput) {
    const context = serviceContextStep(input.provider_id)
    const products = createProductsWorkflow.runAsStep({
      input: transform({ input, context }, ({ input, context }) => ({
        products: [
          {
            title: input.title.trim(),
            description: input.description?.trim() || undefined,
            status: ProductStatus.PUBLISHED,
            // No shipping_profile_id: a service isn't shipped.
            options: [{ title: "Length", values: input.lengths.map((l) => lengthLabel(l.minutes)) }],
            sales_channels: [{ id: context.sales_channel_id }],
            ...(context.category_id ? { category_ids: [context.category_id] } : {}),
            variants: [...input.lengths]
              .sort((a, b) => a.minutes - b.minutes)
              .map((l, variant_rank) => ({
                variant_rank,
                title: lengthLabel(l.minutes),
                manage_inventory: false,
                options: { Length: lengthLabel(l.minutes) },
                metadata: { duration_minutes: l.minutes },
                prices: [{ amount: l.price, currency_code: context.currency_code }],
              })),
          },
        ],
      })),
    })
    const links = transform({ products, context, input }, ({ products, context, input }) => {
      const product = products[0]
      const owner: LinkDefinition = {
        [BOOKING_MODULE]: { booking_provider_id: input.provider_id },
        [Modules.PRODUCT]: { product_id: product.id },
      }
      const offered: LinkDefinition[] = context.resource_ids.flatMap((booking_resource_id) =>
        (product.variants ?? []).map((v) => ({
          [BOOKING_MODULE]: { booking_resource_id },
          [Modules.PRODUCT]: { product_variant_id: v.id },
        }))
      )
      return [owner, ...offered]
    })
    createRemoteLinkStep(links)
    return new WorkflowResponse(transform({ products }, ({ products }) => products[0]))
  }
)
