import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { CORE_PROOF_MODULE } from "../modules/core-proof"
import type CoreProofModuleService from "../modules/core-proof/service"

// SC-1 proof: a subscriber re-exported by the app; records each new product.
export default async function coreProofHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const service = container.resolve<CoreProofModuleService>(CORE_PROOF_MODULE)
  await service.createCoreProofItems({ label: `product ${data.id}` })
}

export const config: SubscriberConfig = {
  event: "product.created",
}
