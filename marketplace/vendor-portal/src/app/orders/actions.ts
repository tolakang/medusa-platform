"use server"

import { revalidatePath } from "next/cache"
import { backendFetch } from "@/lib/server/medusa"
import { requireVendor } from "@/lib/server/vendor"

export type FulfilState = { error?: string; done?: boolean }

// TASKS P6-09: the vendor fulfils what's left of one of its orders
// (POST /vendors/me/orders/:id/fulfillments; only its own, P6-10).
export async function fulfil(_: FulfilState, form: FormData): Promise<FulfilState> {
  const { token } = await requireVendor()
  const id = String(form.get("order_id") ?? "")
  if (!/^order_[A-Za-z0-9]+$/.test(id)) {
    return { error: "Unknown order." }
  }
  // A tracking number and link, if the courier gave one (gap review 2026-11-24).
  const tracking_number = String(form.get("tracking_number") ?? "").trim()
  const tracking_url = String(form.get("tracking_url") ?? "").trim()
  if (tracking_url && !/^https?:\/\/\S+$/.test(tracking_url)) {
    return { error: "The tracking link must start with http:// or https://." }
  }
  const result = await backendFetch(`/vendors/me/orders/${id}/fulfillments`, {
    token,
    method: "POST",
    body: {
      ...(tracking_number ? { tracking_number } : {}),
      ...(tracking_number && tracking_url ? { tracking_url } : {}),
    },
  })
  if (!result.ok) {
    return { error: result.message }
  }
  revalidatePath("/orders")
  revalidatePath("/")
  return { done: true }
}
