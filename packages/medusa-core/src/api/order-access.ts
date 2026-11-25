import { createHmac } from "node:crypto"
import type { MedusaNextFunction, MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { safeEqual } from "../lib/safe-equal"

// Who may read one order on the Store API (GET /store/orders/:id and its
// /telegram-link). Medusa's core route answers anyone holding the order id
// with name, address and phone. Registered in each app's middlewares.ts, so
// it runs after the core's own `authenticate("customer", …,
// { allowUnauthenticated: true })` (docs/MEDUSA_SKILL.md §7, "Order").
//
// Allowed when
//  (a) the signed-in customer owns the order (req.auth_context.actor_id), or
//  (b) the request carries `x-order-access: <exp>.<sig>`, the proof the
//      storefront keeps in its signed cookie for the browser that placed the
//      order: sig = HMAC-SHA256(ORDER_ACCESS_SECRET, "<order_id>.<exp>"), hex,
//      exp in Unix seconds and still in the future
//      (`*/storefront/src/lib/data/order-access.ts`).
// Everyone else gets 404, as if the order did not exist. Without
// ORDER_ACCESS_SECRET only (a) works.

export const ORDER_ACCESS_HEADER = "x-order-access"

export const signOrderAccess = (secret: string, orderId: string, exp: number) =>
  createHmac("sha256", secret).update(`${orderId}.${exp}`).digest("hex")

export function hasValidOrderProof(
  header: unknown,
  orderId: string,
  secret = process.env.ORDER_ACCESS_SECRET?.trim(),
  now = Math.floor(Date.now() / 1000)
): boolean {
  if (!secret || typeof header !== "string") {
    return false
  }
  const [expRaw, sig, ...rest] = header.split(".")
  if (rest.length || !/^\d{1,12}$/.test(expRaw ?? "") || !sig) {
    return false
  }
  const exp = Number(expRaw)
  if (exp <= now) {
    return false
  }
  return safeEqual(sig, signOrderAccess(secret, orderId, exp))
}

export async function requireOrderAccess(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) {
  const orderId = req.params.id
  const notFound = () =>
    next(new MedusaError(MedusaError.Types.NOT_FOUND, `Order with id: ${orderId} was not found`))

  try {
    if (hasValidOrderProof(req.headers[ORDER_ACCESS_HEADER], orderId)) {
      return next()
    }
    const actorId = (req as MedusaRequest & { auth_context?: { actor_id?: string; actor_type?: string } })
      .auth_context
    if (!actorId?.actor_id || actorId.actor_type !== "customer") {
      return notFound()
    }
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const {
      data: [order],
    } = await query.graph({ entity: "order", fields: ["id", "customer_id"], filters: { id: orderId } })
    if (!order || order.customer_id !== actorId.actor_id) {
      return notFound()
    }
    next()
  } catch (e) {
    next(e)
  }
}
