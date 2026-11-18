"use server"

import { revalidatePath } from "next/cache"
import { priceValue } from "@/lib/format"
import { backendFetch } from "@/lib/server/medusa"
import { requirePartner } from "@/lib/server/provider"

export type FormState = { error?: string; info?: string }

const VARIANT = /^variant_[A-Za-z0-9]+$/
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

// TASKS P3-30: a partner builds an event package from their own services:
// up to 5 parts, each a service length at a time on the event day, at one
// price. The shop books every part together on the customer's date.
export async function addPackage(_: FormState, form: FormData): Promise<FormState> {
  const { token } = await requirePartner()
  const title = String(form.get("title") ?? "").trim()
  if (!title) {
    return { error: "Give the package a name." }
  }
  const price = priceValue(String(form.get("price") ?? ""))
  if (typeof price === "string") {
    return { error: price }
  }
  const pieces = [0, 1, 2, 3, 4]
    .map((i) => ({
      variant_id: String(form.get(`variant_${i}`) ?? ""),
      time: String(form.get(`time_${i}`) ?? ""),
      label: String(form.get(`label_${i}`) ?? "").trim() || null,
    }))
    .filter((p) => p.variant_id)
  if (!pieces.length) {
    return { error: "Add at least one part." }
  }
  if (pieces.some((p) => !VARIANT.test(p.variant_id) || !HHMM.test(p.time))) {
    return { error: "Give each part a service and a time." }
  }
  const description = String(form.get("description") ?? "").trim()
  const result = await backendFetch("/providers/me/packages", {
    token,
    method: "POST",
    body: { title, description: description || null, price, pieces: pieces.map((p) => ({ ...p, day: 0 })) },
  })
  if (!result.ok) {
    return { error: result.message }
  }
  revalidatePath("/packages")
  return { info: `"${title}" is in the shop.` }
}
