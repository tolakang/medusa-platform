"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { actionError, isValidPhone, PHONE_MESSAGE } from "@/lib/format"
import { backendFetch } from "@/lib/server/medusa"
import { getToken } from "@/lib/server/session"

export type SettingsState = { error?: string; info?: string }

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim()

// The session token only, with no /sellers/me round trip (requireSeller throws
// when the backend is down, which replaced the form with the error page and
// lost what was typed). No session: sign in again.
async function sessionToken(): Promise<string> {
  const token = await getToken()
  if (!token) {
    redirect("/logout")
  }
  return token
}

// A refused token signs the seller out; any other failure stays on the form.
function failed(result: { status: number; message: string }): SettingsState {
  if (result.status === 401) {
    redirect("/logout")
  }
  return { error: actionError(result) }
}

// The seller's shop name, contact and payout account (POST /sellers/me; gap
// review 2026-11-24, role test 2026-11-25). Empty fields clear.
export async function saveSettings(_: SettingsState, form: FormData): Promise<SettingsState> {
  const token = await sessionToken()
  const name = text(form, "name")
  if (!name) {
    return { error: "Give your shop a name." }
  }
  if (!isValidPhone(text(form, "phone"))) {
    return { error: PHONE_MESSAGE }
  }
  const result = await backendFetch("/sellers/me", {
    token,
    method: "POST",
    body: {
      name,
      phone: text(form, "phone"),
      telegram: text(form, "telegram"),
      payout_bank_name: text(form, "payout_bank_name"),
      payout_account_name: text(form, "payout_account_name"),
      payout_account_number: text(form, "payout_account_number"),
    },
  })
  if (!result.ok) {
    return failed(result)
  }
  revalidatePath("/", "layout")
  return { info: "Saved." }
}

// Change password while signed in (POST /sellers/me/password).
export async function changePassword(_: SettingsState, form: FormData): Promise<SettingsState> {
  const token = await sessionToken()
  const current = String(form.get("current_password") ?? "")
  const next = String(form.get("new_password") ?? "")
  if (!current || next.length < 8) {
    return { error: "Enter your current password and a new one of at least 8 characters." }
  }
  if (next !== String(form.get("confirm") ?? "")) {
    return { error: "The two new passwords don't match." }
  }
  const result = await backendFetch("/sellers/me/password", {
    token,
    method: "POST",
    body: { current_password: current, new_password: next },
  })
  if (!result.ok) {
    return failed(result)
  }
  return { info: "Password changed." }
}
