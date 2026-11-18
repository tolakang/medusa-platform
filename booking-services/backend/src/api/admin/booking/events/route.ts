import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { PACKAGE_DATE_KEY, PACKAGE_ITEM_KEY } from "../../../../lib/packages"

// GET /admin/booking/events?from=&to= (TASKS P3-30): event packages with a
// piece in the window (default: from now, 90 days), soonest first, each with
// its pieces (time, calendar, status), the customer and the order. Holds
// that ran out (expired, or past their time) were never booked: left out.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const from = typeof req.query.from === "string" ? new Date(req.query.from) : new Date()
  const to = typeof req.query.to === "string" ? new Date(req.query.to) : new Date(from.getTime() + 90 * 86_400_000)
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data: pieces } = await query.graph({
    entity: "booking",
    fields: [
      "id",
      "package_id",
      "status",
      "starts_at",
      "ends_at",
      "hold_expires_at",
      "customer_id",
      "address",
      "notes",
      "resource.name",
      "resource.timezone",
      "order.id",
      "order.display_id",
      "order.email",
      "order.items.product_title",
      "order.items.variant_title",
      "order.items.metadata",
    ],
    filters: {
      package_id: { $ne: null },
      status: ["pending", "confirmed", "cancelled", "completed", "no_show"],
      starts_at: { $lt: to },
      ends_at: { $gt: from },
    },
  })
  const now = Date.now()
  const live = pieces.filter((p) => !(p.status === "pending" && p.hold_expires_at && new Date(p.hold_expires_at).getTime() <= now))
  const byPackage = new Map<string, typeof live>()
  for (const p of live) byPackage.set(p.package_id!, [...(byPackage.get(p.package_id!) ?? []), p])
  const events = [...byPackage.entries()].map(([id, ps]) => {
    const sorted = [...ps].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
    const items = sorted.find((p) => p.order)?.order?.items ?? []
    const head = items.find((i) => {
      const m = (i?.metadata ?? {}) as Record<string, unknown>
      return m[PACKAGE_ITEM_KEY] === id && !m.booking_id
    })
    const order = sorted.find((p) => p.order)?.order
    const statuses = new Set(sorted.map((p) => p.status))
    return {
      id,
      title: head?.product_title ?? "Event package",
      event_date: ((head?.metadata ?? {}) as Record<string, unknown>)[PACKAGE_DATE_KEY] ?? null,
      status: statuses.size === 1 ? sorted[0].status : "mixed",
      order: order ? { id: order.id, display_id: order.display_id, email: order.email } : null,
      address: sorted.find((p) => p.address)?.address ?? null,
      notes: sorted.find((p) => p.notes)?.notes ?? null,
      pieces: sorted.map((p) => {
        const item = items.find((i) => ((i?.metadata ?? {}) as Record<string, unknown>).booking_id === p.id)
        return {
          id: p.id,
          title: item ? `${item.product_title}${item.variant_title ? ` (${item.variant_title})` : ""}` : null,
          status: p.status,
          starts_at: p.starts_at,
          ends_at: p.ends_at,
          resource: p.resource?.name ?? null,
          timezone: p.resource?.timezone ?? null,
        }
      }),
    }
  })
  events.sort((a, b) => new Date(a.pieces[0].starts_at).getTime() - new Date(b.pieces[0].starts_at).getTime())
  res.json({ events })
}
