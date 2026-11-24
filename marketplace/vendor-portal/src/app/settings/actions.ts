"use server"

import { revalidatePath } from "next/cache"
import { backendFetch } from "@/lib/server/medusa"
import { requireVendor } from "@/lib/server/vendor"

export type SettingsState = { error?: string; info?: string }

// The shop's name and logo (POST /vendors/me; gap review 2026-11-24).
export async function saveSettings(_: SettingsState, form: FormData): Promise<SettingsState> {
  const { token } = await requireVendor()
  const name = String(form.get("name") ?? "").trim()
  const logo = String(form.get("logo") ?? "").trim()
  if (!name) {
    return { error: "Give the shop a name." }
  }
  if (logo && !/^https:\/\/\S+$/.test(logo)) {
    return { error: "The logo must be a link that starts with https://." }
  }
  const result = await backendFetch("/vendors/me", { token, method: "POST", body: { name, logo: logo || null } })
  if (!result.ok) {
    return { error: result.message }
  }
  revalidatePath("/", "layout")
  return { info: "Saved." }
}
