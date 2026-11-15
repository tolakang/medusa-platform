// Every email the core knows (order and account emails). An app's renderer
// (src/modules/resend/templates.ts) returns this, after any template of its own.
import { renderAccountEmail } from "./account-email"
import { renderOrderEmail } from "./order-email"
import type { RenderedEmail } from "./service"

export function renderCoreEmail(
  template: string | null | undefined,
  data: Record<string, unknown> | null | undefined
): RenderedEmail | null {
  return renderOrderEmail(template, data) ?? renderAccountEmail(template, data)
}
