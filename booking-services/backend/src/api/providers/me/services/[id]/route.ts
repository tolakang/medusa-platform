import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { updateProductsWorkflow, updateProductVariantsWorkflow } from "@medusajs/medusa/core-flows"
import type { PostProviderServiceUpdateType } from "../../../validators"
import { assertOwnService, assertPartner, ownServices } from "../../own"

// POST /providers/me/services/:id (TASKS P3-32): a partner renames a service,
// changes its description, hides or shows it (draft / published) or changes
// the price of its lengths. Only their own service and its own lengths.
export const POST = async (req: AuthenticatedMedusaRequest<PostProviderServiceUpdateType>, res: MedusaResponse) => {
  const providerId = req.auth_context.actor_id
  await assertPartner(req.scope, providerId)
  const service = (await assertOwnService(req.scope, providerId, req.params.id)) as {
    id: string
    variants?: { id: string; prices?: { currency_code: string }[] }[]
  }
  const { prices, ...fields } = req.validatedBody
  if (Object.keys(fields).length) {
    await updateProductsWorkflow(req.scope).run({ input: { selector: { id: service.id }, update: fields } })
  }
  if (prices?.length) {
    const variants = new Map((service.variants ?? []).map((v) => [v.id, v]))
    const product_variants = prices.map((p) => {
      const variant = variants.get(p.variant_id)
      const currency_code = variant?.prices?.[0]?.currency_code
      if (!variant || !currency_code) {
        throw new MedusaError(MedusaError.Types.NOT_FOUND, `Length ${p.variant_id} was not found.`)
      }
      return { id: p.variant_id, prices: [{ amount: p.price, currency_code }] }
    })
    await updateProductVariantsWorkflow(req.scope).run({ input: { product_variants } })
  }
  const [updated] = await ownServices(req.scope, providerId, service.id)
  res.json({ service: updated })
}
