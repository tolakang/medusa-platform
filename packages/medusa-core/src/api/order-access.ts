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
//  (b) no customer is signed in and the request carries `x-order-access: <exp>.<sig>`, the proof the
//      storefront keeps in its signed cookie for the browser that placed the
//      order: sig = HMAC-SHA256(ORDER_ACCESS_SECRET, "<order_id>.<exp>"), hex,
//      exp in Unix seconds and still in the future
//      (`*/storefront/src/lib/data/order-access.ts`).
// A signed-in customer is judged by (a) (plus the app's extra rule), or by
//  (c) a guest order placed with the customer's own email, plus a valid proof:
//      a guest who orders and then signs in keeps the confirmation page. Guest
//      means no customer_id, or a customer without an account (Medusa's guest
//      customer, has_account false). A proof another buyer left in the same
//      browser opens nothing: their email differs. Holding both the cookie and
//      the email is needed; the cookie exists only in the placing browser.
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

/**
 * An app's own extra rule, asked only when the signed-in customer does not own
 * the order (wholesale: an admin of the buyer's company). True lets it through.
 */
export type ExtraOrderAccess = (
  scope: MedusaRequest["scope"],
  order: { id: string; customer_id?: string | null },
  customerId: string
) => Promise<boolean>

const sameEmail = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()

async function isOwnGuestOrder(
  query: { graph: (...args: any[]) => Promise<{ data: any[] }> },
  order: { customer_id?: string | null; email?: string | null },
  customerId: string
): Promise<boolean> {
  const ids = [customerId, order.customer_id].filter((id): id is string => !!id)
  const { data: customers } = await query.graph({
    entity: "customer",
    fields: ["id", "email", "has_account"],
    filters: { id: ids },
  })
  const me = customers.find((c: { id: string }) => c.id === customerId)
  if (!me || !sameEmail(me.email, order.email)) {
    return false
  }
  if (!order.customer_id) {
    return true
  }
  const placedBy = customers.find((c: { id: string }) => c.id === order.customer_id)
  return !!placedBy && placedBy.has_account === false
}

export const requireOrderAccessWith = (extra?: ExtraOrderAccess) =>
  async function requireOrderAccess(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction
) {
  const orderId = req.params.id
  const notFound = () =>
    next(new MedusaError(MedusaError.Types.NOT_FOUND, `Order with id: ${orderId} was not found`))

  try {
    const auth = (req as MedusaRequest & { auth_context?: { actor_id?: string; actor_type?: string } })
      .auth_context
    const customerId = auth?.actor_type === "customer" ? auth.actor_id : undefined
    // No one signed in: only the placing browser's proof.
    if (!customerId) {
      return hasValidOrderProof(req.headers[ORDER_ACCESS_HEADER], orderId) ? next() : notFound()
    }
    // Signed in: ownership (or the app's extra rule) decides, and a proof
    // left in this browser by another buyer grants nothing.
    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
    const {
      data: [order],
    } = await query.graph({ entity: "order", fields: ["id", "customer_id", "email"], filters: { id: orderId } })
    if (!order) {
      return notFound()
    }
    if (order.customer_id === customerId) {
      return next()
    }
    if (extra && (await extra(req.scope, order, customerId))) {
      return next()
    }
    if (
      hasValidOrderProof(req.headers[ORDER_ACCESS_HEADER], orderId) &&
      (await isOwnGuestOrder(query, order, customerId))
    ) {
      return next()
    }
    return notFound()
  } catch (e) {
    next(e)
  }
}

export const requireOrderAccess = requireOrderAccessWith()
