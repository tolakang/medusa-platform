import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { parsePosQuery } from "../../pos-query"
import {
  findPosSale,
  POS_SALE_RECORDED_MESSAGE,
  posCheckoutWorkflow,
} from "../../../workflows/pos-checkout"
import { GetPosCheckout, type PostPosCheckoutType } from "../validators"

// POST /pos/checkout (TASKS P2-06): a sale on the open shift (pos-checkout,
// P2-05). Returns the order with what the receipt prints. A retry with the
// same client_ref (the answer was lost) gets the sale already recorded,
// with 200 instead of 201 (review 2, S7).
export const POST = async (req: AuthenticatedMedusaRequest<PostPosCheckoutType>, res: MedusaResponse) => {
  let orderId: string
  let status = 201
  try {
    const { result } = await posCheckoutWorkflow(req.scope).run({
      input: { ...req.validatedBody, cashier_id: req.auth_context.actor_id },
    })
    orderId = result.order_id
  } catch (error) {
    const clientRef = req.validatedBody.client_ref
    const recorded =
      (error as Error)?.message === POS_SALE_RECORDED_MESSAGE && clientRef
        ? await findPosSale(req.scope, req.validatedBody.shift_id, clientRef)
        : null
    if (!recorded) {
      throw error
    }
    orderId = recorded
    status = 200
  }
  const order = await posReceiptOrder(req.scope, orderId)
  res.status(status).json({ order, payment_method: req.validatedBody.payment_method })
}

// What the receipt prints.
async function posReceiptOrder(container: MedusaContainer, orderId: string) {
  const {
    data: [order],
  } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "order",
    fields: [
      "id",
      "display_id",
      "created_at",
      "currency_code",
      "email",
      "customer_id",
      "subtotal",
      "discount_total",
      "tax_total",
      "total",
      "items.id",
      "items.title",
      "items.variant_title",
      "items.variant_sku",
      "items.quantity",
      "items.unit_price",
      "items.total",
    ],
    filters: { id: orderId },
  })
  return order
}

// GET /pos/checkout?shift_id&client_ref (owner, 2026-11-25): after a lost
// answer the till asks whether the sale was recorded. 404 means it was not:
// pos-checkout records a sale in one workflow, so a sale is either complete
// or not there. Asked while that sale is still running, the shift lock makes
// the answer wait for it.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const { shift_id, client_ref } = parsePosQuery(GetPosCheckout, req.query)
  const locking = req.scope.resolve(Modules.LOCKING)
  const orderId = await locking.execute(`pos-shift:${shift_id}`, () => findPosSale(req.scope, shift_id, client_ref), {
    timeout: 10,
  })
  if (!orderId) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "This sale was not recorded.")
  }
  res.json({ order: await posReceiptOrder(req.scope, orderId) })
}
