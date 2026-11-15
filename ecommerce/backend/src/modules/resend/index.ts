import { ModuleProvider, Modules } from "@medusajs/framework/utils"
import { createResendNotificationService } from "@medusa-platform/medusa-core/lib/resend/service"
import { renderEmail } from "./templates"

// The Resend provider comes from the shared core (BUILD_PLAN.md §4.2); this
// app gives it its own email templates (./templates). Identifier
// `notification-resend`, registered as `id: "resend"` (plan §4.4).
export default ModuleProvider(Modules.NOTIFICATION, {
  services: [createResendNotificationService(renderEmail)],
})
