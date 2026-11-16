"use server"

import { revalidatePath } from "next/cache"
import { parseLengths, priceValue } from "@/lib/format"
import { backendFetch } from "@/lib/server/medusa"
import { requirePartner } from "@/lib/server/provider"

export type FormState = { error?: string; info?: string }

const PRODUCT = /^prod_[A-Za-z0-9]+$/
const VARIANT = /^variant_[A-Za-z0-9]+$/

// TASKS P3-32: a partner adds a service with its lengths and prices. It is
// listed in the shop and offers the partner's own hours.
export async function addService(_: FormState, form: FormData): Promise<FormState> {
  const { token } = await requirePartner()
  const title = String(form.get("title") ?? "").trim()
  if (!title) {
    return { error: "Give the service a name." }
  }
  const lengths = parseLengths(
    [0, 1, 2, 3].map((i) => ({ minutes: String(form.get(`minutes_${i}`) ?? ""), price: String(form.get(`price_${i}`) ?? "") }))
  )
  if (typeof lengths === "string") {
    return { error: lengths }
  }
  const description = String(form.get("description") ?? "").trim()
  const result = await backendFetch("/providers/me/services", {
    token,
    method: "POST",
    body: { title, description: description || null, lengths },
  })
  if (!result.ok) {
    return { error: result.message }
  }
  revalidatePath("/services")
  return { info: `"${title}" is in the shop.` }
}

// Show or hide a service, or change a length's price.
export async function updateService(_: FormState, form: FormData): Promise<FormState> {
  const { token } = await requirePartner()
  const id = String(form.get("service_id") ?? "")
  if (!PRODUCT.test(id)) {
    return { error: "Unknown service." }
  }
  const status = String(form.get("status") ?? "")
  const body: Record<string, unknown> = {}
  if (status === "draft" || status === "published") {
    body.status = status
  }
  const variant = String(form.get("variant_id") ?? "")
  if (variant) {
    const price = priceValue(String(form.get("price") ?? ""))
    if (!VARIANT.test(variant) || typeof price === "string") {
      return { error: typeof price === "string" ? price : "Unknown length." }
    }
    body.prices = [{ variant_id: variant, price }]
  }
  const result = await backendFetch(`/providers/me/services/${id}`, { token, method: "POST", body })
  if (!result.ok) {
    return { error: result.message }
  }
  revalidatePath("/services")
  return { info: "Saved." }
}
