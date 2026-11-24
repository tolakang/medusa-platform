"use server"

import { revalidatePath } from "next/cache"
import { backendFetch } from "@/lib/server/medusa"
import { requireSeller } from "@/lib/server/seller"

export type SettingsState = { error?: string; info?: string }

// The seller's shop name (POST /sellers/me; gap review 2026-11-24).
export async function saveSettings(_: SettingsState, form: FormData): Promise<SettingsState> {
  const { token } = await requireSeller()
  const name = String(form.get("name") ?? "").trim()
  if (!name) {
    return { error: "Give your shop a name." }
  }
  const result = await backendFetch("/sellers/me", { token, method: "POST", body: { name } })
  if (!result.ok) {
    return { error: result.message }
  }
  revalidatePath("/", "layout")
  return { info: "Saved." }
}
