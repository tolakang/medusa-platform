import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { createProviderPackageWorkflow } from "../../../../workflows/provider-package"
import type { PostProviderPackageType } from "../../validators"
import { assertPartner, ownPackages } from "../own"

// GET /providers/me/packages (TASKS P3-30): the partner's own event packages.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.json({ packages: await ownPackages(req.scope, req.auth_context.actor_id) })
}

// POST /providers/me/packages { title, description?, price, pieces }: a
// partner builds an event package from their own service lengths.
export const POST = async (req: AuthenticatedMedusaRequest<PostProviderPackageType>, res: MedusaResponse) => {
  const providerId = req.auth_context.actor_id
  await assertPartner(req.scope, providerId)
  const { result } = await createProviderPackageWorkflow(req.scope).run({ input: { provider_id: providerId, ...req.validatedBody } })
  const created = (await ownPackages(req.scope, providerId)).find((p) => p.id === result.id)
  res.status(201).json({ package: created })
}
