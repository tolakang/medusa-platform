import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { SELLER_MODULE } from "../../../modules/seller"
import SellerModuleService from "../../../modules/seller/service"

// GET /sellers/me (plan §9.5; TASKS P5-03): the signed-in seller and their
// sales channel. P5-06 adds products and commissions.
const meOf = async (req: AuthenticatedMedusaRequest) => {
  const {
    data: [seller],
  } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph(
    {
      entity: "seller",
      fields: [
        "id",
        "handle",
        "name",
        "email",
        "domain",
        "status",
        "commission_rate",
        "sales_channel.id",
        "sales_channel.name",
      ],
      filters: { id: req.auth_context.actor_id },
    },
    { throwIfKeyNotFound: true }
  )
  return seller
}

export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.json({ seller: await meOf(req) })
}

// POST /sellers/me (gap review 2026-11-24): the seller changes their shop
// name. Domain, handle and rate stay the shop owner's.
export const PostSellerMe = z.object({ name: z.string().trim().min(1).max(120) }).strict()

export const POST = async (req: AuthenticatedMedusaRequest<z.infer<typeof PostSellerMe>>, res: MedusaResponse) => {
  await req.scope
    .resolve<SellerModuleService>(SELLER_MODULE)
    .updateSellers({ id: req.auth_context.actor_id, name: req.validatedBody.name })
  res.json({ seller: await meOf(req) })
}
