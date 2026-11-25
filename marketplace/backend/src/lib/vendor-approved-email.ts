import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { escapeHtml } from "@medusa-platform/medusa-core/lib/order-notification"
import { portalLink } from "@medusa-platform/medusa-core/lib/email-verified"

// "Your shop is approved" (bug 2026-11-25: the pending screen promised an
// email that was never sent). Sent through the Notification Module's email
// channel like the account emails (Resend, or notification-local when
// RESEND_API_KEY is unset), with an idempotency key per vendor so a second
// approval doesn't send it twice (MEDUSA_SKILL: createNotifications skips a
// key that already succeeded).
export const VENDOR_APPROVED_TEMPLATE = "vendor-approved"

export type VendorApprovedData = { shop: string; url: string | null }

export function vendorApprovedEmail(data: VendorApprovedData) {
  const subject = "Your shop is approved"
  const button = data.url
    ? `<p><a href="${escapeHtml(data.url)}" style="display:inline-block;background:#111;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Sign in to the vendor portal</a></p>`
    : ""
  const html = `<!doctype html>
<html><body style="font-family:Arial,sans-serif;color:#111">
<h2>${escapeHtml(subject)}</h2>
<p>${escapeHtml(data.shop)} can now sell on the marketplace. Sign in to add your products.</p>
${button}
</body></html>`
  return { subject, html }
}

export async function sendVendorApprovedEmail(
  container: MedusaContainer,
  vendor: { id: string; name: string; admins?: ({ email?: string | null } | null)[] | null }
) {
  const url = portalLink("login", {}, process.env.VENDOR_PORTAL_URL, process.env.VENDOR_CORS)
  const emails = [
    ...new Set((vendor.admins ?? []).map((a) => a?.email).filter(Boolean) as string[]),
  ]
  for (const to of emails) {
    try {
      await container.resolve(Modules.NOTIFICATION).createNotifications({
        to,
        channel: "email",
        template: VENDOR_APPROVED_TEMPLATE,
        data: { shop: vendor.name, url: url?.replace(/\?$/, "") ?? null },
        idempotency_key: `vendor_approved_${vendor.id}_${to}`,
      })
    } catch (error) {
      // The approval stands; only the email failed.
      container
        .resolve(ContainerRegistrationKeys.LOGGER)
        .warn(`Vendor approval email to ${to} not sent: ${(error as Error).message}`)
    }
  }
}
