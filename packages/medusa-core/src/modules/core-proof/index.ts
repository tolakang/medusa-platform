import { Module } from "@medusajs/framework/utils"
import CoreProofModuleService from "./service"

export const CORE_PROOF_MODULE = "core_proof"

export default Module(CORE_PROOF_MODULE, {
  service: CoreProofModuleService,
})
