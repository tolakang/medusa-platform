import { ContainerRegistrationKeys, MathBN, Modules } from "@medusajs/framework/utils"
import { createStep, createWorkflow, StepResponse, transform, when, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { createPaymentCollectionsStep, createRemoteLinkStep } from "@medusajs/medusa/core-flows"
import { BALANCE_METADATA_KEY, depositNow, depositPercent, instalmentsDue, paymentPlan } from "../lib/deposits"

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

// What's still due after checkout (TASKS P3-26, P3-30): one entry per later
// instalment of a payment plan line (due days before the event), and one for
// the rest of the deposit lines (due at the first booking).
type Due = { amount: number; due_at: string | null; instalment: number | null }
type Balance = { order_id: string; currency_code: string; dues: Due[] } | null

const balanceDueStep = createStep("balance-due", async (input: { order_id: string }, { container }) => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [order],
  } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "total",
      "currency_code",
      "items.total",
      "items.variant.product.metadata",
      "payment_collections.amount",
      "payment_collections.metadata",
      "bookings.starts_at",
    ],
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
  let rest = cents(MathBN.sub(cents(order.total), paidFor))
  if (rest <= 0) {
    return new StepResponse<Balance>(null)
  }
  const starts = ((order as unknown as { bookings?: { starts_at: string }[] }).bookings ?? [])
    .map((b) => new Date(b.starts_at).toISOString())
    .sort()
  const first = starts[0] ?? null
  const dues: Due[] = []
  const now = new Date()
  for (const item of order.items ?? []) {
    const plan = paymentPlan(item?.variant?.product?.metadata as Record<string, unknown> | null)
    if (!plan || !first) continue
    instalmentsDue(item!.total, plan, new Date(first), now).forEach((d, i) => {
      dues.push({ amount: d.amount, due_at: d.due_at, instalment: i + 2 })
      rest = cents(MathBN.sub(rest, d.amount))
    })
  }
  if (rest > 0) dues.push({ amount: rest, due_at: first, instalment: null })
  return new StepResponse<Balance>(dues.length ? { order_id: order.id, currency_code: order.currency_code, dues } : null)
})

// Run by the order.placed subscriber after the bookings are confirmed and
// linked (their start sets the due dates). Each entry is an order payment
// collection (as createOrderPaymentCollectionWorkflow: the payment
// collection, then its link to the order), marked a booking balance with its
// due date: the admin shows it outstanding with "Mark as paid", and the
// reminder job emails before its due date. Idempotent: an order that already
// has a balance collection is skipped.
export const createBookingBalanceWorkflow = createWorkflow("create-booking-balance", function (input: { order_id: string }) {
  const balance = balanceDueStep(input)
  when("has-balance", balance, (b) => !!b).then(() => {
    const created = createPaymentCollectionsStep(
      transform({ balance }, ({ balance }) =>
        balance!.dues.map((d) => ({
          currency_code: balance!.currency_code,
          amount: d.amount,
          metadata: {
            [BALANCE_METADATA_KEY]: true,
            due_at: d.due_at,
            ...(d.instalment ? { instalment: d.instalment } : {}),
          },
        }))
      )
    )
    createRemoteLinkStep(
      transform({ balance, created }, ({ balance, created }) =>
        created.map((c) => ({
          [Modules.ORDER]: { order_id: balance!.order_id },
          [Modules.PAYMENT]: { payment_collection_id: c.id },
        }))
      )
    ).config({ name: "link-booking-balances" })
  })
  return new WorkflowResponse(balance)
})
