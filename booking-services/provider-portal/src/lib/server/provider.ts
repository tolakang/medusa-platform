import "server-only"
import { redirect } from "next/navigation"
import { backendFetch } from "./medusa"
import { getToken } from "./session"

// TASKS P3-32: every page runs as the signed-in provider (staff or partner).
// No valid token, or the backend refuses it (suspended, expired: 401) →
// /logout. A partner waiting for approval (403 on everything but GET
// /providers/me) sees the pages with the waiting notice and no data. Other
// failures throw (error page).

export type Calendar = { id: string; name: string; type: string; timezone: string; is_active: boolean }
export type Provider = {
  id: string
  role: "staff" | "partner"
  status: "invited" | "pending" | "active" | "suspended"
  email: string
  name: string
  handle: string
  phone: string | null
  bio: string | null
  photo: string | null
  area: string | null
  // Partners only: staff never see money.
  commission_rate?: number | null
  resources: Calendar[]
}

export async function requireProvider(): Promise<{ token: string; provider: Provider }> {
  const token = await getToken()
  if (!token) {
    redirect("/logout")
  }
  const me = await backendFetch<{ provider: Provider }>("/providers/me", { token })
  if (!me.ok) {
    // Only a refused session signs the provider out; an outage shows the
    // error page (as the vendor portal, REVIEW_FIXES C5).
    if (me.status === 401 || me.status === 403) {
      redirect("/logout")
    }
    throw new Error(me.message)
  }
  return { token, provider: me.data.provider }
}

/** A partner's page: staff are sent to their calendar. */
export async function requirePartner(): Promise<{ token: string; provider: Provider }> {
  const session = await requireProvider()
  if (session.provider.role !== "partner") {
    redirect("/")
  }
  return session
}

/** A backend read as the provider; a refused token signs them out. */
export async function providerGet<T>(token: string, path: string, query?: Record<string, string>): Promise<T> {
  const result = await backendFetch<T>(path, { token, query })
  if (!result.ok) {
    if (result.status === 401) {
      redirect("/logout")
    }
    throw new Error(result.message)
  }
  return result.data
}
