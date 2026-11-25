import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { addBookingToCartWorkflow } from "../../../../workflows/add-booking-to-cart"
import type { PostBookingCartType } from "../validators"

// GET /store/booking/cart?cart_id= : the cart's pending holds and when each
// runs out (hold_expires_at), so the cart can show a countdown per booking
// line. The cart id is the secret, as for GET /store/carts/:id.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const cartId = typeof req.query.cart_id === "string" ? req.query.cart_id : ""
  if (!cartId) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, "cart_id is required")
  }
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "booking",
    fields: ["id", "hold_expires_at"],
    filters: { cart_id: cartId, status: "pending" },
  })
  res.json({
    holds: (data as { id: string; hold_expires_at: Date | string | null }[])
      .filter((b) => b.hold_expires_at)
      .map((b) => ({ booking_id: b.id, hold_expires_at: new Date(b.hold_expires_at!).toISOString() })),
  })
}

// POST /store/booking/cart { cart_id, variant_id, resource_id, starts_at,
// ends_at, notes? } (TASKS P3-10, F-047): hold the time and add it to the
// cart (add-booking-to-cart, P3-04). Not in the plan's route list; the
// storefront needs it (P3-13).
export const POST = async (req: MedusaRequest<PostBookingCartType>, res: MedusaResponse) => {
  const { result } = await addBookingToCartWorkflow(req.scope).run({
    input: req.validatedBody,
  })
  res.json({
    booking: {
      id: result.booking.id,
      status: result.booking.status,
      starts_at: result.booking.starts_at,
      ends_at: result.booking.ends_at,
      hold_expires_at: result.booking.hold_expires_at,
    },
    line_item_id: result.line_item_id,
  })
}
