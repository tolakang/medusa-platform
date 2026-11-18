import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { randomUUID } from "crypto"
import { RECURRING_SERVICE_MESSAGE, recurringService, weeklyOccurrences } from "../../../../lib/recurring"
import { BOOKING_MODULE } from "../../../../modules/booking"
import type BookingModuleService from "../../../../modules/booking/service"
import { addBookingToCartWorkflow } from "../../../../workflows/add-booking-to-cart"
import { releaseSeriesHoldsWorkflow } from "../../../../workflows/release-series-holds"
import type { PostRecurringType } from "../validators"

// POST /store/booking/recurring { cart_id, variant_id, resource_id,
// starts_at, ends_at, weeks, address?, notes? } (TASKS P3-29): the same
// calendar and local time every week, `weeks` times, into the cart at once.
// All or nothing: when a week isn't free, nothing is added and the answer
// lists those weeks (`conflicts`). Each week is its own booking and line
// (normal price), sharing a `series_id`.
export const POST = async (req: MedusaRequest<PostRecurringType>, res: MedusaResponse) => {
  const body = req.validatedBody
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const booking = req.scope.resolve<BookingModuleService>(BOOKING_MODULE)
  const {
    data: [variant],
  } = await query.graph({ entity: "product_variant", fields: ["id", "product.metadata"], filters: { id: body.variant_id } })
  if (!variant || !recurringService(variant.product?.metadata as Record<string, unknown> | null)) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, RECURRING_SERVICE_MESSAGE)
  }
  const [resource] = await booking.listBookingResources({ id: body.resource_id })
  if (!resource) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, `Booking resource ${body.resource_id} was not found.`)
  }

  const weeks = weeklyOccurrences(new Date(body.starts_at), new Date(body.ends_at), resource.timezone, body.weeks)
  const conflicts: string[] = []
  for (const w of weeks) {
    const check = await booking.checkSlot({ resource_id: resource.id, starts_at: w.starts_at, ends_at: w.ends_at, ignore_cart_id: body.cart_id })
    if (!check.available) conflicts.push(w.starts_at.toISOString())
  }
  if (conflicts.length) {
    res.status(400).json({
      type: "not_allowed",
      message: `${conflicts.length} of the ${weeks.length} weeks aren't free. Choose another time.`,
      conflicts,
    })
    return
  }

  const series_id = `bser_${randomUUID().replace(/-/g, "")}`
  const added: { booking_id: string; line_item_id: string }[] = []
  try {
    for (const w of weeks) {
      const { result } = await addBookingToCartWorkflow(req.scope).run({
        input: {
          cart_id: body.cart_id,
          variant_id: body.variant_id,
          resource_id: resource.id,
          starts_at: w.starts_at.toISOString(),
          ends_at: w.ends_at.toISOString(),
          ...(body.address ? { address: body.address } : {}),
          ...(body.notes ? { notes: body.notes } : {}),
          series_id,
        },
      })
      added.push({ booking_id: result.booking.id, line_item_id: result.line_item_id })
    }
  } catch (e) {
    // Someone took a week meanwhile: take the weeks already added back out.
    if (added.length) {
      await releaseSeriesHoldsWorkflow(req.scope).run({ input: { cart_id: body.cart_id, added } })
    }
    throw e
  }
  res.json({
    series_id,
    bookings: weeks.map((w, i) => ({ id: added[i].booking_id, starts_at: w.starts_at.toISOString(), ends_at: w.ends_at.toISOString() })),
  })
}
