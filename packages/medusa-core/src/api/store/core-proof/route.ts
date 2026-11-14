import type { MedusaResponse, MedusaStoreRequest } from "@medusajs/framework/http"
import { CORE_PROOF_MODULE } from "../../../modules/core-proof"
import type CoreProofModuleService from "../../../modules/core-proof/service"

// SC-1 proof: GET /store/core-proof, re-exported by the app's own route file.
export const GET = async (req: MedusaStoreRequest, res: MedusaResponse) => {
  const service = req.scope.resolve<CoreProofModuleService>(CORE_PROOF_MODULE)
  const [, count] = await service.listAndCountCoreProofItems({})
  res.json({ ok: true, items: count })
}
