import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { joinWaitlistWorkflow } from "../../../../workflows/booking-waitlist"
import type { PostWaitlistType } from "../validators"

// GET /store/booking/waitlist: the signed-in customer's waitlist (TASKS
// P3-29), soonest day first, with the service's title and handle.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "booking_waitlist",
    fields: ["id", "variant_id", "date", "status", "notified_at"],
    filters: { customer_id: req.auth_context.actor_id, status: ["waiting", "notified"] },
  })
  const ids = [...new Set(data.map((w) => w.variant_id))]
  const { data: variants } = ids.length
    ? await query.graph({ entity: "product_variant", fields: ["id", "title", "product.title", "product.handle"], filters: { id: ids } })
    : { data: [] }
  const byId = new Map(variants.map((v) => [v.id, v]))
  res.json({
    waitlist: data
      .map((w) => ({
        ...w,
        service: byId.get(w.variant_id)?.product?.title ?? null,
        variant_title: byId.get(w.variant_id)?.title ?? null,
        handle: byId.get(w.variant_id)?.product?.handle ?? null,
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  })
}

// POST /store/booking/waitlist { variant_id, date }: wait for a full day.
export const POST = async (req: AuthenticatedMedusaRequest<PostWaitlistType>, res: MedusaResponse) => {
  const { result } = await joinWaitlistWorkflow(req.scope).run({
    input: { ...req.validatedBody, customer_id: req.auth_context.actor_id },
  })
  res.json({ waitlist: { id: result.id, date: result.date, status: result.status } })
}
