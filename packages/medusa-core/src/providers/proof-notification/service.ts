import { AbstractNotificationProviderService } from "@medusajs/framework/utils"
import type {
  Logger,
  ProviderSendNotificationDTO,
  ProviderSendNotificationResultsDTO,
} from "@medusajs/framework/types"

type InjectedDependencies = { logger: Logger }

// SC-1 proof: a provider registered from the core in the app's medusa-config.
class ProofNotificationProviderService extends AbstractNotificationProviderService {
  static identifier = "notification-core-proof"
  protected logger_: Logger

  constructor({ logger }: InjectedDependencies) {
    super()
    this.logger_ = logger
  }

  async send(
    notification: ProviderSendNotificationDTO
  ): Promise<ProviderSendNotificationResultsDTO> {
    this.logger_.info(`core-proof notification to ${notification.to}`)
    return { id: `core-proof-${Date.now()}` }
  }
}

export default ProofNotificationProviderService
