import { ContainerRegistrationKeys, MathBN, Modules } from "@medusajs/framework/utils"
import { createStep, createWorkflow, StepResponse, transform, when, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { createOrderPaymentCollectionWorkflow } from "@medusajs/medusa/core-flows"
import { BALANCE_METADATA_KEY, depositNow, depositPercent } from "../lib/deposits"

// Deposit and balance (TASKS P3-26). Two steps around Medusa's own payment
// flow:
// 1. Before a payment session is created for a cart, its payment collection's
//    amount is set to what is due now (a new session takes that amount; the
//    cart completion doesn't compare it with the total, core-flows
//    complete-cart notes "Payment Validation").
// 2. When the order is placed, the rest becomes an order payment collection
//    (createOrderPaymentCollectionWorkflow): the admin shows it as the
//    outstanding amount with "Mark as paid". Its metadata marks it as a
//    booking balance with the date of the first booking (reminders).

const cents = (v: unknown) => MathBN.convert((v ?? 0) as number, 2).toNumber()

const setDepositStep = createStep(
  "set-deposit",
  async (input: { payment_collection_id: string }, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const {
      data: [collection],
    } = await query.graph({
      entity: "payment_collection",
      fields: ["id", "amount", "cart.id"],
      filters: { id: input.payment_collection_id },
    })
    const cartId = (collection as { cart?: { id?: string } } | undefined)?.cart?.id
    if (!collection || !cartId) {
      return new StepResponse(null, null)
    }
    // Item totals need a top-level total in the query (as cancel-booking).
    const {
      data: [cart],
    } = await query.graph({
      entity: "cart",
      fields: ["id", "total", "items.total", "items.variant.product.metadata"],
      filters: { id: cartId },
    })
    const lines = (cart?.items ?? []).filter(Boolean).map((i) => ({ total: i!.total, percent: depositPercent(i!.variant?.product) }))
    if (!cart || !lines.some((l) => l.percent !== null)) {
      return new StepResponse(null, null)
    }
    const now = depositNow(lines)
    const before = cents(collection.amount)
    if (now === before) {
      return new StepResponse(now, null)
    }
    await container.resolve(Modules.PAYMENT).updatePaymentCollections(collection.id, { amount: now })
    return new StepResponse(now, { id: collection.id, amount: before })
  },
  async (previous, { container }) => {
    if (previous) {
      await container.resolve(Modules.PAYMENT).updatePaymentCollections(previous.id, { amount: previous.amount })
    }
  }
)

export const setCartDepositWorkflow = createWorkflow("set-cart-deposit", function (input: { payment_collection_id: string }) {
  return new WorkflowResponse(setDepositStep(input))
})

type Balance = { order_id: string; amount: number; due_at: string | null } | null

const balanceDueStep = createStep("balance-due", async (input: { order_id: string }, { container }) => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [order],
  } = await query.graph({
    entity: "order",
    fields: ["id", "total", "items.variant.product.metadata", "payment_collections.amount", "payment_collections.metadata", "bookings.starts_at"],
    filters: { id: input.order_id },
  })
  if (!order || !(order.items ?? []).some((i) => depositPercent(i?.variant?.product) !== null)) {
    return new StepResponse<Balance>(null)
  }
  const collections = (order.payment_collections ?? []).filter(Boolean)
  if (collections.some((c) => (c!.metadata as Record<string, unknown> | null)?.[BALANCE_METADATA_KEY])) {
    return new StepResponse<Balance>(null)
  }
  const paidFor = collections.reduce((s, c) => MathBN.add(s, cents(c!.amount)), MathBN.convert(0))
  const rest = cents(MathBN.sub(cents(order.total), paidFor))
  if (rest <= 0) {
    return new StepResponse<Balance>(null)
  }
  const starts = ((order as unknown as { bookings?: { starts_at: string }[] }).bookings ?? [])
    .map((b) => new Date(b.starts_at).toISOString())
    .sort()
  return new StepResponse<Balance>({ order_id: order.id, amount: rest, due_at: starts[0] ?? null })
})

const markBalanceStep = createStep(
  "mark-balance",
  async (input: { collection_id: string; due_at: string | null }, { container }) => {
    await container.resolve(Modules.PAYMENT).updatePaymentCollections(input.collection_id, {
      metadata: { [BALANCE_METADATA_KEY]: true, due_at: input.due_at },
    })
    return new StepResponse(input.collection_id)
  }
)

// Run by the order.placed subscriber after the bookings are confirmed and
// linked (their start is the due date). Idempotent: an order that already has
// its balance collection is skipped.
export const createBookingBalanceWorkflow = createWorkflow("create-booking-balance", function (input: { order_id: string }) {
  const balance = balanceDueStep(input)
  const created = when("has-balance", balance, (b) => !!b).then(() => {
    const collections = createOrderPaymentCollectionWorkflow.runAsStep({
      input: transform({ balance }, ({ balance }) => ({ order_id: balance!.order_id, amount: balance!.amount })),
    })
    markBalanceStep(
      transform({ collections, balance }, ({ collections, balance }) => ({
        collection_id: collections[0].id,
        due_at: balance!.due_at,
      }))
    )
    return collections
  })
  return new WorkflowResponse(transform({ balance, created }, ({ balance }) => balance))
})
