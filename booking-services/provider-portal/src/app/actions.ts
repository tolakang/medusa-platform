"use server"

import { revalidatePath } from "next/cache"
import { backendFetch } from "@/lib/server/medusa"
import { requireProvider } from "@/lib/server/provider"
import { isDate, walkInTimes } from "@/lib/time"

export type FormState = { error?: string; info?: string }

const ID = /^[a-z]+_[A-Za-z0-9]+$/

// TASKS P3-32: a walk-in on one of the provider's own calendars (POST
// /providers/me/bookings): confirmed at once, inside the opening hours.
export async function bookWalkIn(_: FormState, form: FormData): Promise<FormState> {
  const { token, provider } = await requireProvider()
  const calendar = provider.resources.find((r) => r.id === String(form.get("resource_id") ?? ""))
  const date = String(form.get("date") ?? "")
  const time = String(form.get("time") ?? "")
  const minutes = Number(form.get("minutes") ?? "")
  if (!calendar || !isDate(date)) {
    return { error: "Unknown calendar or day." }
  }
  if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
    return { error: "Enter the start time, e.g. 09:30." }
  }
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 720) {
    return { error: "Enter the length in minutes, from 5 to 720." }
  }
  const notes = String(form.get("notes") ?? "").trim().slice(0, 500)
  const result = await backendFetch("/providers/me/bookings", {
    token,
    method: "POST",
    body: { resource_id: calendar.id, ...walkInTimes(date, time, minutes, calendar.timezone), notes: notes || null },
  })
  if (!result.ok) {
    return { error: result.message }
  }
  revalidatePath("/")
  return { info: `Booked ${time} for ${minutes} minutes.` }
}

// A provider cancels a booking on their own calendar; the shop's policy
// decides the refund.
export async function cancelBooking(_: FormState, form: FormData): Promise<FormState> {
  const { token } = await requireProvider()
  const id = String(form.get("booking_id") ?? "")
  if (!ID.test(id)) {
    return { error: "Unknown booking." }
  }
  const result = await backendFetch<{ refund: string }>(`/providers/me/bookings/${id}/cancel`, {
    token,
    method: "POST",
    body: {},
  })
  if (!result.ok) {
    return { error: result.message }
  }
  revalidatePath("/")
  return { info: result.data.refund === "refunded" ? "Cancelled. The customer is refunded." : "Cancelled." }
}
