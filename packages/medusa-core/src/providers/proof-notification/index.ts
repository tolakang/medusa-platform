import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import ProofNotificationProviderService from "./service"

export default ModuleProvider(Modules.NOTIFICATION, {
  services: [ProofNotificationProviderService],
})
