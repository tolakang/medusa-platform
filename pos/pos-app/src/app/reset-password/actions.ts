"use server"

import { sdk } from "@/lib/server/medusa"

// Forgot password (design critique, 2026-11-23): the backend emails a link to
// this app's /reset-password page (its auth-password-reset subscriber), or the
// admin copies one for them (Reset link). The token works for 15 minutes.

export type ResetState = { error?: string; info?: string }

const MIN_PASSWORD = 8
const field = (form: FormData, name: string) => String(form.get(name) ?? "").trim()

export async function forgotPassword(_: ResetState, form: FormData): Promise<ResetState> {
  const email = field(form, "email").toLowerCase()
  if (!email) {
    return { error: "Enter your email." }
  }
  try {
    await sdk.auth.resetPassword("cashier", "emailpass", { identifier: email })
  } catch (e) {
    if ((e as { status?: number })?.status === 429) {
      return { error: "Too many tries. Wait a few minutes and try again." }
    }
  }
  // The same answer whether or not the email has an account.
  return { info: `If ${email} has an account, we emailed a link to set a new password. It works for 15 minutes.` }
}

export async function resetPassword(_: ResetState, form: FormData): Promise<ResetState> {
  const email = field(form, "email")
  const token = field(form, "token")
  const password = String(form.get("password") ?? "")
  if (!email || !token) {
    return { error: "This link is invalid or has expired. Ask for a new one." }
  }
  if (password.length < MIN_PASSWORD) {
    return { error: `Use at least ${MIN_PASSWORD} characters.` }
  }
  if (password !== String(form.get("confirm") ?? "")) {
    return { error: "The two passwords don't match." }
  }
  try {
    await sdk.auth.updateProvider("cashier", "emailpass", { email, password }, token)
  } catch {
    return { error: "This link is invalid or has expired. Ask for a new one." }
  }
  return { info: "Your password is changed. Sign in with the new one." }
}
