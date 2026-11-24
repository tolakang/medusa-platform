import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { z } from "@medusajs/framework/zod"
import { MARKETPLACE_MODULE } from "../../../modules/marketplace"
import type MarketplaceModuleService from "../../../modules/marketplace/service"
import { vendorResponse } from "../../vendor-auth"
import { vendorIdOf } from "./vendor-orders"

// GET /vendors/me (TASKS P6-03): the signed-in vendor admin and their vendor,
// including its status, so a pending vendor can see it waits for approval.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.json(await vendorResponse(req.scope, req.auth_context.actor_id))
}

// POST /vendors/me (gap review 2026-11-24): the vendor changes its shop name
// or logo. The shop address (handle) stays, so links keep working.
export const PostVendorMe = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    logo: z.string().trim().url().max(500).nullable().optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: "Send name or logo." })

export const POST = async (req: AuthenticatedMedusaRequest<z.infer<typeof PostVendorMe>>, res: MedusaResponse) => {
  const id = await vendorIdOf(req)
  if (!id) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Vendor not found")
  }
  await req.scope.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE).updateVendors({ id, ...req.validatedBody })
  res.json(await vendorResponse(req.scope, req.auth_context.actor_id))
}
