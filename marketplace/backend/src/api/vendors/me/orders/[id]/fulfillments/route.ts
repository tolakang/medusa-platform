import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { createOrderFulfillmentWorkflow } from "@medusajs/medusa/core-flows"
import { z } from "@medusajs/framework/zod"
import { ownVendorOrder } from "../../../vendor-orders"

export const NOTHING_TO_FULFIL_MESSAGE = "Everything in this order is already fulfilled."

// POST /vendors/me/orders/:id/fulfillments (TASKS P6-09, P6-10): the vendor
// fulfils what's left of its own order, with Medusa's
// createOrderFulfillmentWorkflow (it takes the stock reserved for the child
// order's items, P6-05, and uses the shipping option copied from the
// customer's order). Someone else's order answers 404.
// Optional (gap review 2026-11-24): a tracking number and link, and only some
// items (default: everything left).
export const PostVendorFulfillment = z
  .object({
    tracking_number: z.string().trim().min(1).max(100).optional(),
    tracking_url: z.string().trim().url().max(500).optional(),
    items: z
      .array(z.object({ id: z.string().min(1), quantity: z.number().int().min(1) }))
      .min(1)
      .max(100)
      .optional(),
  })
  .strict()

export const POST = async (
  req: AuthenticatedMedusaRequest<z.infer<typeof PostVendorFulfillment>>,
  res: MedusaResponse
) => {
  const body = req.validatedBody ?? {}
  const order = await ownVendorOrder(req, req.params.id)
  if (order.status === "canceled") {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This order is canceled.")
  }
  const items = body.items
    ? body.items.map((i) => {
        const left = order.remaining[i.id] ?? 0
        if (i.quantity > left) {
          throw new MedusaError(MedusaError.Types.INVALID_DATA, `Only ${left} of that item are left to send.`)
        }
        return i
      })
    : Object.entries(order.remaining)
        .filter(([, quantity]) => quantity > 0)
        .map(([id, quantity]) => ({ id, quantity }))
  if (!items.length) {
    throw new MedusaError(MedusaError.Types.NOT_ALLOWED, NOTHING_TO_FULFIL_MESSAGE)
  }
  await createOrderFulfillmentWorkflow(req.scope).run({
    input: {
      order_id: order.id,
      items,
      ...(body.tracking_number
        ? { labels: [{ tracking_number: body.tracking_number, tracking_url: body.tracking_url ?? "", label_url: "" }] }
        : {}),
    },
  })
  res.json({ order: await ownVendorOrder(req, order.id) })
}
