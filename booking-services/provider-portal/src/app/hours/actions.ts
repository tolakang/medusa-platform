"use server"

import { revalidatePath } from "next/cache"
import { parseHours } from "@/lib/format"
import { backendFetch } from "@/lib/server/medusa"
import { requirePartner } from "@/lib/server/provider"
import { isDate } from "@/lib/time"

export type FormState = { error?: string; info?: string }

const own = async (form: FormData) => {
  const { token, provider } = await requirePartner()
  const calendar = provider.resources.find((r) => r.id === String(form.get("resource_id") ?? ""))
  return { token, calendar }
}

// TASKS P3-32: a partner replaces a calendar's weekly hours.
export async function saveHours(_: FormState, form: FormData): Promise<FormState> {
  const { token, calendar } = await own(form)
  if (!calendar) {
    return { error: "Unknown calendar." }
  }
  const schedules = parseHours(Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, String(form.get(`day_${d}`) ?? "")])))
  if (typeof schedules === "string") {
    return { error: schedules }
  }
  const result = await backendFetch(`/providers/me/resources/${calendar.id}`, { token, method: "POST", body: { schedules } })
  if (!result.ok) {
    return { error: result.message }
  }
  revalidatePath("/hours")
  return { info: schedules.length ? "Hours saved." : "Hours saved: closed every day." }
}

export async function addDayOff(_: FormState, form: FormData): Promise<FormState> {
  const { token, calendar } = await own(form)
  const date = String(form.get("date") ?? "")
  if (!calendar || !isDate(date)) {
    return { error: "Choose a day." }
  }
  const result = await backendFetch(`/providers/me/resources/${calendar.id}/days-off`, { token, method: "POST", body: { date } })
  if (!result.ok) {
    return { error: result.message }
  }
  revalidatePath("/hours")
  return { info: `${date} is a day off. Bookings already made that day stay.` }
}

export async function removeDayOff(_: FormState, form: FormData): Promise<FormState> {
  const { token, calendar } = await own(form)
  const date = String(form.get("date") ?? "")
  if (!calendar || !isDate(date)) {
    return { error: "Unknown day." }
  }
  const result = await backendFetch(`/providers/me/resources/${calendar.id}/days-off/${date}`, { token, method: "DELETE" })
  if (!result.ok) {
    return { error: result.message }
  }
  revalidatePath("/hours")
  return {}
}
