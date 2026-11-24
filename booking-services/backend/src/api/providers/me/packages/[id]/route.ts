import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { updateProductsWorkflow, updateProductVariantsWorkflow } from "@medusajs/medusa/core-flows"
import type { PostProviderPackageUpdateType } from "../../../validators"
import { assertPartner, ownPackages } from "../../own"

// POST /providers/me/packages/:id (gap review 2026-11-24): a partner renames
// one of their own packages, changes its description or price, or hides it
// (draft) and shows it again (published). Someone else's package is 404.
export const POST = async (req: AuthenticatedMedusaRequest<PostProviderPackageUpdateType>, res: MedusaResponse) => {
  const providerId = req.auth_context.actor_id
  await assertPartner(req.scope, providerId)
  const own = (await ownPackages(req.scope, providerId)).find((p) => p.id === req.params.id)
  if (!own) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Package ${req.params.id} was not found.`)
  }
  const { price, ...fields } = req.validatedBody
  if (Object.keys(fields).length) {
    await updateProductsWorkflow(req.scope).run({ input: { selector: { id: own.id }, update: fields } })
  }
  if (price !== undefined) {
    const {
      data: [product],
    } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
      entity: "product",
      fields: ["variants.id", "variants.prices.currency_code"],
      filters: { id: own.id },
    })
    const variant = (product as { variants?: { id: string; prices?: { currency_code: string }[] }[] } | undefined)?.variants?.[0]
    const currency_code = variant?.prices?.[0]?.currency_code
    if (!variant || !currency_code) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "This package has no price to change.")
    }
    await updateProductVariantsWorkflow(req.scope).run({
      input: { product_variants: [{ id: variant.id, prices: [{ amount: price, currency_code }] }] },
    })
  }
  const updated = (await ownPackages(req.scope, providerId)).find((p) => p.id === own.id)
  res.json({ package: updated })
}
