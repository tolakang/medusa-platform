"use server"

import { revalidatePath } from "next/cache"
import { backendFetch } from "@/lib/server/medusa"
import { requireProvider } from "@/lib/server/provider"

export type FormState = { error?: string; info?: string }

const optional = (form: FormData, name: string) => {
  const value = String(form.get(name) ?? "").trim()
  return value || null
}

// TASKS P3-32: a provider edits their own profile (shown on their public
// page in the shop for partners).
export async function saveProfile(_: FormState, form: FormData): Promise<FormState> {
  const { token } = await requireProvider()
  const name = String(form.get("name") ?? "").trim()
  if (!name) {
    return { error: "Enter your name." }
  }
  const photo = optional(form, "photo")
  if (photo && !/^https?:\/\//.test(photo)) {
    return { error: "The photo is a web address starting with https://." }
  }
  const result = await backendFetch("/providers/me", {
    token,
    method: "POST",
    body: { name, phone: optional(form, "phone"), area: optional(form, "area"), bio: optional(form, "bio"), photo },
  })
  if (!result.ok) {
    return { error: result.message }
  }
  revalidatePath("/", "layout")
  return { info: "Profile saved." }
}
