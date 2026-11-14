import { MedusaService } from "@medusajs/framework/utils"
import CoreProofItem from "./models/core-proof-item"

class CoreProofModuleService extends MedusaService({ CoreProofItem }) {}

export default CoreProofModuleService
