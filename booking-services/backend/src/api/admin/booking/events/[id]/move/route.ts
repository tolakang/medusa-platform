import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { addDays } from "../../../../../../lib/packages"
import { toLocalTime, zonedTimeToUtc } from "../../../../../../modules/booking/utils/slot"
import { moveBookingWorkflow } from "../../../../../../workflows/move-booking"
import { setPackageDateWorkflow } from "../../../../../../workflows/set-package-date"
import type { PostAdminEventMoveType } from "../../../validators"

// POST /admin/booking/events/:id/move { date } (TASKS P3-30 follow-up): move a
// whole event package to another date. Every piece keeps its calendar and
// local time and moves by the same number of days, each checked like any
// staff move; if one can't, the ones already moved go back and nothing
// changes. Then the order's package line gets the new date and the customer
// gets one email (not one per piece).
export const POST = async (req: AuthenticatedMedusaRequest<PostAdminEventMoveType>, res: MedusaResponse) => {
  const { data: pieces } = await req.scope.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "booking",
    fields: ["id", "starts_at", "resource.timezone"],
    filters: { package_id: req.params.id, status: ["pending", "confirmed"] },
  })
  if (!pieces.length) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "This event package was not found.")
  }
  const sorted = [...pieces].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
  const tz = sorted[0].resource?.timezone ?? "UTC"
  const from = toLocalTime(new Date(sorted[0].starts_at), tz).date
  const days = Math.round((Date.parse(`${req.validatedBody.date}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
  if (days === 0) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "The event is already on that date.")
  }

  // Later pieces first when moving later (earlier first when earlier), so a
  // piece never lands on one of its own event's pieces not moved yet
  // (review finding).
  const order = days > 0 ? [...sorted].reverse() : sorted
  const moved: { id: string; starts_at: string }[] = []
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    for (const p of order) {
      const zone = p.resource?.timezone ?? tz
      const local = toLocalTime(new Date(p.starts_at), zone)
      const starts = zonedTimeToUtc(addDays(local.date, days), local.time, zone)
      await moveBookingWorkflow(req.scope).run({ input: { booking_id: p.id, by: "staff", quiet: true, starts_at: starts.toISOString() } })
      moved.push({ id: p.id, starts_at: new Date(p.starts_at).toISOString() })
    }
    await setPackageDateWorkflow(req.scope).run({ input: { package_id: req.params.id, date: req.validatedBody.date } })
  } catch (e) {
    // Put back what moved, last first; a piece that can't go back is logged
    // and named in the error, never left silently (review finding).
    const stuck: string[] = []
    for (const m of [...moved].reverse()) {
      await moveBookingWorkflow(req.scope)
        .run({ input: { booking_id: m.id, by: "staff", quiet: true, starts_at: m.starts_at } })
        .catch((err: Error) => {
          stuck.push(m.id)
          logger.error(`Event ${req.params.id}: booking ${m.id} could not go back to ${m.starts_at}: ${err.message}`)
        })
    }
    if (stuck.length) {
      throw new MedusaError(
        MedusaError.Types.UNEXPECTED_STATE,
        `The event couldn't move (${(e as Error).message}), and these pieces couldn't go back: ${stuck.join(", ")}. Check them in Bookings.`
      )
    }
    throw e
  }
  res.json({ moved: moved.length, date: req.validatedBody.date })
}
