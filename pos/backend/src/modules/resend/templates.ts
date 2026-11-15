// Email templates of this app for the shared Resend provider (./index.ts).
// Order emails come from the core (renderOrderEmail); account emails are
// rendered here until account security moves (BUILD_PLAN.md §4.2).
import { escapeHtml } from "@medusa-platform/medusa-core/lib/order-notification"
import { renderOrderEmail } from "@medusa-platform/medusa-core/lib/resend/order-email"
import {
  type AuthEmailData,
  PASSWORD_CHANGED_TEMPLATE,
  PASSWORD_RESET_TEMPLATE,
  VERIFY_EMAIL_TEMPLATE,
} from "../../lib/auth-email"

// Account emails (TASKS P1-18): one button with the link, the link as text
// for mail apps that hide buttons, and when it expires.
function accountEmail(subject: string, intro: string, action: string, data: AuthEmailData) {
  const url = escapeHtml(data.url)
  const expires = data.expires_minutes
    ? `<p>This link works once and expires in ${escapeHtml(data.expires_minutes)} minutes.</p>`
    : `<p>This link works once.</p>`
  const html = `<!doctype html>
<html><body style="font-family:Arial,sans-serif;color:#111">
<h2>${escapeHtml(subject)}</h2>
<p>${escapeHtml(intro)}</p>
<p><a href="${url}" style="display:inline-block;background:#111;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">${escapeHtml(action)}</a></p>
<p style="font-size:13px;color:#555">Or open this link: <a href="${url}">${url}</a></p>
${expires}
<p style="font-size:13px;color:#555">If you didn't ask for this, ignore this email. Nothing changes.</p>
</body></html>`
  return { subject, html }
}

export function renderEmail(
  template: string | null | undefined,
  data: Record<string, unknown> | null | undefined
): { subject: string; html: string } | null {
  const orderEmail = renderOrderEmail(template, data)
  if (orderEmail) {
    return orderEmail
  }
  const auth = data as AuthEmailData | null | undefined
  if (template === VERIFY_EMAIL_TEMPLATE && auth?.url) {
    return accountEmail(
      "Confirm your email",
      "Thanks for creating an account. Confirm your email address to activate it.",
      "Confirm email",
      auth
    )
  }
  if (template === PASSWORD_RESET_TEMPLATE && auth?.url) {
    return accountEmail(
      "Reset your password",
      "We received a request to reset the password of your account.",
      "Choose a new password",
      auth
    )
  }
  if (template === PASSWORD_CHANGED_TEMPLATE) {
    return passwordChanged(auth?.url)
  }
  return null
}

// After a signed-in customer changes their password (no secret in the link).
function passwordChanged(forgotUrl: string | undefined) {
  const subject = "Your password was changed"
  const link = forgotUrl
    ? `<p>If you didn't change it, <a href="${escapeHtml(forgotUrl)}">reset your password now</a> to secure your account.</p>`
    : `<p>If you didn't change it, use "Forgot password?" on the sign-in page to secure your account.</p>`
  const html = `<!doctype html>
<html><body style="font-family:Arial,sans-serif;color:#111">
<h2>${subject}</h2>
<p>The password of your account was just changed.</p>
${link}
</body></html>`
  return { subject, html }
}
