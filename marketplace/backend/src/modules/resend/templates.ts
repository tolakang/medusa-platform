// This app's email templates for the shared Resend provider (./index.ts): the
// vendor approval email, then the core's order and account emails
// (BUILD_PLAN.md §4.2).
import { renderCoreEmail } from "@medusa-platform/medusa-core/lib/resend/emails"
import type { RenderedEmail } from "@medusa-platform/medusa-core/lib/resend/service"
import {
  VENDOR_APPROVED_TEMPLATE,
  vendorApprovedEmail,
  type VendorApprovedData,
} from "../../lib/vendor-approved-email"

export function renderEmail(
  template: string | null | undefined,
  data: Record<string, unknown> | null | undefined
): RenderedEmail | null {
  if (template === VENDOR_APPROVED_TEMPLATE && (data as VendorApprovedData | null)?.shop) {
    return vendorApprovedEmail(data as VendorApprovedData)
  }
  return renderCoreEmail(template, data)
}
