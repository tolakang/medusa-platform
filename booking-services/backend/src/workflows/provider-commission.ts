import { randomUUID } from "node:crypto"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MathBN, MedusaError } from "@medusajs/framework/utils"
import {
  createStep,
  createWorkflow,
  StepResponse,
  transform,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { acquireLockStep, releaseLockStep } from "@medusajs/medusa/core-flows"
import { bookingIdOf } from "../lib/booking-cart-rules"
import {
  commissionAmount,
  commissionBase,
  commissionRateFor,
  groupPayouts,
  PAYOUTS_LOCK,
  providerPayoutAmount,
} from "../lib/provider-commission"
import { BOOKING_MODULE } from "../modules/booking"
import type BookingModuleService from "../modules/booking/service"

// Partner money (TASKS P3-33, plan §9.3 "Money"), as Marketplace's vendor
// commissions and payouts (P6-06, F-078): the customer pays the shop; each
// partner booking records the shop's commission at the partner's rate (the
// shop's default when unset); staff bookings earn none. Each month the
// partner gets one payout per currency, paid by hand and marked paid.
// Refunds: cancelling a booking with a refund cancels its commission; a
// refund the cancels don't explain (an admin refund on the order) holds
// the order's commissions for the admin to settle.

const booking = (container: { resolve: (k: string) => unknown }) =>
  container.resolve(BOOKING_MODULE) as BookingModuleService

const money = (v: unknown) => MathBN.convert((v ?? 0) as number, 2).toNumber()

// --- Record (order placed) ---

const recordCommissionsStep = createStep(
  "record-commissions",
  async (input: { order_id: string }, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    // Item totals are computed only when a top-level total is asked for
    // (OrderModuleService shouldIncludeTotals; as cancel-booking).
    const {
      data: [order],
    } = await query.graph({
      entity: "order",
      fields: ["id", "total", "currency_code", "items.id", "items.metadata", "items.total", "items.tax_total"],
      filters: { id: input.order_id },
    })
    const lines = (order?.items ?? [])
      .map((i) => ({ item: i!, booking_id: bookingIdOf(i?.metadata as Record<string, unknown> | null) }))
      .filter((l): l is { item: NonNullable<typeof l.item>; booking_id: string } => !!l.booking_id)
    if (!order || !lines.length) {
      return new StepResponse([] as string[], [] as string[])
    }
    const service = booking(container)
    const done = new Set(
      (await service.listBookingCommissions({ booking_id: lines.map((l) => l.booking_id) })).map((c) => c.booking_id)
    )
    const todo = lines.filter((l) => !done.has(l.booking_id))
    if (!todo.length) {
      return new StepResponse([] as string[], [] as string[])
    }
    const { data: bookings } = await query.graph({
      entity: "booking",
      fields: ["id", "resource.provider.id", "resource.provider.role", "resource.provider.commission_rate"],
      filters: { id: todo.map((l) => l.booking_id) },
    })
    const partnerOf = new Map(
      bookings
        .filter((b) => b.resource?.provider?.role === "partner")
        .map((b) => [b.id, b.resource!.provider!] as const)
    )
    const rows = todo
      .filter((l) => partnerOf.has(l.booking_id))
      .map((l) => {
        const partner = partnerOf.get(l.booking_id)!
        const base = commissionBase({ total: l.item.total as never, tax_total: l.item.tax_total as never })
        const rate = commissionRateFor(partner)
        const amount = commissionAmount(base, rate)
        return {
          provider_id: partner.id,
          booking_id: l.booking_id,
          order_id: order.id,
          line_item_id: l.item.id,
          line_total: money(l.item.total),
          base,
          rate,
          amount,
          payout_amount: providerPayoutAmount(money(l.item.total), amount),
          currency_code: order.currency_code,
        }
      })
    const created = rows.length ? await service.createBookingCommissions(rows) : []
    const ids = created.map((c) => c.id)
    return new StepResponse(ids, ids)
  },
  async (ids, { container }) => {
    if (ids?.length) {
      await booking(container).deleteBookingCommissions(ids)
    }
  }
)

// Run by the order.placed subscriber after the bookings are confirmed.
// Idempotent: a booking that already has a commission is skipped (and
// booking_id is unique).
export const recordProviderCommissionsWorkflow = createWorkflow(
  "record-provider-commissions",
  function (input: { order_id: string }) {
    return new WorkflowResponse(recordCommissionsStep(input))
  }
)

// --- A booking is cancelled ---

type CancelInput = { booking_id: string; refunded_amount: number }
type CommissionState = { id: string; status: string; refunded_amount: number; refund_review: string }

const commissionOnCancelStep = createStep(
  "commission-on-cancel",
  async (input: CancelInput, { container }) => {
    const service = booking(container)
    const [c] = await service.listBookingCommissions({ booking_id: input.booking_id })
    if (!c) {
      return new StepResponse<string, CommissionState | null>("none", null)
    }
    const before: CommissionState = {
      id: c.id,
      status: c.status,
      refunded_amount: money(c.refunded_amount),
      refund_review: c.refund_review,
    }
    if (input.refunded_amount <= 0) {
      // Cancelled too late for a refund: the customer paid, the partner is owed.
      return new StepResponse<string, CommissionState | null>("kept", null)
    }
    if (c.status === "pending") {
      await service.updateBookingCommissions({ id: c.id, status: "cancelled", refunded_amount: input.refunded_amount })
      return new StepResponse<string, CommissionState | null>("cancelled", before)
    }
    // Already in a payout (approved or paid): flag for the admin to settle
    // with the partner by hand.
    await service.updateBookingCommissions({ id: c.id, refunded_amount: input.refunded_amount, refund_review: "to_review" })
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn(`Booking ${input.booking_id} was refunded after its commission ${c.id} went into payout ${c.payout_id}; settle it with the partner.`)
    return new StepResponse<string, CommissionState | null>("flagged", before)
  },
  async (before, { container }) => {
    if (before) {
      const { id, status, refunded_amount, refund_review } = before
      await booking(container).updateBookingCommissions({
        id,
        status: status as "pending",
        refunded_amount,
        refund_review: refund_review as "none",
      })
    }
  }
)

// Run by cancel-booking after the refund (the payout lock keeps a payout run
// from approving the commission at the same time).
export const providerCommissionOnCancelWorkflow = createWorkflow(
  "provider-commission-on-cancel",
  function (input: CancelInput) {
    const ownerId = transform(input, () => `provider-commission-cancel:${randomUUID()}`)
    acquireLockStep({ key: PAYOUTS_LOCK, ownerId, timeout: 60, ttl: 30 })
    const result = commissionOnCancelStep(input)
    releaseLockStep({ key: PAYOUTS_LOCK, ownerId })
    return new WorkflowResponse(result)
  }
)

// --- An order is cancelled ---

const cancelOrderCommissionsStep = createStep(
  "cancel-order-commissions",
  async (input: { order_id: string }, { container }) => {
    const service = booking(container)
    const all = await service.listBookingCommissions({ order_id: input.order_id })
    const pending = all.filter((c) => c.status === "pending")
    for (const c of all.filter((c) => c.status === "approved" || c.status === "paid")) {
      container
        .resolve(ContainerRegistrationKeys.LOGGER)
        .warn(`Order ${input.order_id} was cancelled, but commission ${c.id} is ${c.status} (payout ${c.payout_id}); settle it with the partner.`)
    }
    if (pending.length) {
      await service.updateBookingCommissions(pending.map((c) => ({ id: c.id, status: "cancelled" as const })))
    }
    const ids = pending.map((c) => c.id)
    return new StepResponse(ids, ids)
  },
  async (ids, { container }) => {
    if (ids?.length) {
      await booking(container).updateBookingCommissions(ids.map((id) => ({ id, status: "pending" as const })))
    }
  }
)

export const cancelOrderCommissionsWorkflow = createWorkflow(
  "cancel-order-commissions",
  function (input: { order_id: string }) {
    const ownerId = transform(input, () => `provider-commission-order:${randomUUID()}`)
    acquireLockStep({ key: PAYOUTS_LOCK, ownerId, timeout: 60, ttl: 30 })
    const ids = cancelOrderCommissionsStep(input)
    releaseLockStep({ key: PAYOUTS_LOCK, ownerId })
    return new WorkflowResponse(ids)
  }
)

// --- Refunds the booking cancels don't explain ---

/**
 * Orders (of these) refunded more than their cancelled bookings explain:
 * the order's payment collections have refunded more than the commissions
 * recorded as refunded at cancel.
 */
export async function ordersWithUnexplainedRefund(container: MedusaContainer, orderIds: string[]): Promise<Set<string>> {
  if (!orderIds.length) {
    return new Set()
  }
  const { data: orders } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "order",
    fields: ["id", "payment_collections.refunded_amount"],
    filters: { id: [...new Set(orderIds)] },
  })
  const explained = new Map<string, number>()
  for (const c of await booking(container).listBookingCommissions({ order_id: orderIds })) {
    explained.set(c.order_id, (explained.get(c.order_id) ?? 0) + money(c.refunded_amount))
  }
  return new Set(
    orders
      .filter((o) => {
        const refunded = (o.payment_collections ?? []).reduce((s, pc) => s + money(pc?.refunded_amount), 0)
        return refunded > (explained.get(o.id) ?? 0) + 0.001
      })
      .map((o) => o.id)
  )
}

/** A refund on an order holds its pending commissions for review (payment.refunded). */
export async function flagRefundedOrder(container: MedusaContainer, orderId: string) {
  if (!(await ordersWithUnexplainedRefund(container, [orderId])).has(orderId)) {
    return { flagged: 0 }
  }
  const service = booking(container)
  const toFlag = (await service.listBookingCommissions({ order_id: orderId })).filter(
    (c) => c.status === "pending" && c.refund_review === "none"
  )
  if (toFlag.length) {
    await service.updateBookingCommissions(toFlag.map((c) => ({ id: c.id, refund_review: "to_review" as const })))
  }
  return { flagged: toFlag.length }
}

// --- Payouts ---

type CreatePayoutsInput = { cutoff: Date; period: string }
type Created = { payout_ids: string[]; commission_ids: string[] }

const createPayoutsStep = createStep(
  "create-payouts",
  async (input: CreatePayoutsInput, { container }) => {
    const service = booking(container)
    const due = await service.listBookingCommissions(
      { status: "pending", created_at: { $lt: input.cutoff } },
      { select: ["id", "order_id", "provider_id", "currency_code", "payout_amount", "refund_review"] }
    )
    // Hold a commission whose order has a refund the cancels don't explain,
    // unless the admin settled it.
    const refunded = await ordersWithUnexplainedRefund(
      container,
      due.filter((c) => c.refund_review !== "settled").map((c) => c.order_id)
    )
    const held = due.filter((c) => c.refund_review === "to_review" || (c.refund_review === "none" && refunded.has(c.order_id)))
    const toFlag = held.filter((c) => c.refund_review === "none")
    if (toFlag.length) {
      await service.updateBookingCommissions(toFlag.map((c) => ({ id: c.id, refund_review: "to_review" as const })))
    }
    const lines = groupPayouts(
      due.filter((c) => !held.includes(c)).map((c) => ({ ...c, provider_id: c.provider_id as string }))
    )
    const taken = new Set(
      (await service.listBookingPayouts({ period: input.period })).map((p) => `${p.provider_id}:${p.currency_code}`)
    )
    const created: Created = { payout_ids: [], commission_ids: [] }
    const payouts: { id: string; provider_id: string; currency_code: string; amount: number; count: number }[] = []
    try {
      for (const line of lines) {
        if (taken.has(`${line.provider_id}:${line.currency_code}`)) {
          continue
        }
        const payout = await service.createBookingPayouts({
          provider_id: line.provider_id,
          currency_code: line.currency_code,
          amount: line.amount,
          period: input.period,
        })
        created.payout_ids.push(payout.id)
        await service.updateBookingCommissions(
          line.commission_ids.map((id) => ({ id, status: "approved" as const, payout_id: payout.id }))
        )
        created.commission_ids.push(...line.commission_ids)
        payouts.push({ ...line, id: payout.id, count: line.commission_ids.length })
      }
    } catch (e) {
      await undoPayouts(service, created)
      throw e
    }
    return new StepResponse(payouts, created)
  },
  async (created, { container }) => {
    if (created) {
      await undoPayouts(booking(container), created)
    }
  }
)

async function undoPayouts(service: BookingModuleService, created: Created) {
  if (created.commission_ids.length) {
    await service.updateBookingCommissions(
      created.commission_ids.map((id) => ({ id, status: "pending" as const, payout_id: null }))
    )
  }
  if (created.payout_ids.length) {
    await service.deleteBookingPayouts(created.payout_ids)
  }
}

// Run by the daily job on BOOKING_PAYOUT_DAY for the month before. One run
// at a time.
export const createProviderPayoutsWorkflow = createWorkflow(
  "create-provider-payouts",
  function (input: CreatePayoutsInput) {
    const ownerId = transform(input, () => `provider-payouts:${randomUUID()}`)
    acquireLockStep({ key: PAYOUTS_LOCK, ownerId, timeout: 30, ttl: 120 })
    const payouts = createPayoutsStep(input)
    releaseLockStep({ key: PAYOUTS_LOCK, ownerId })
    return new WorkflowResponse(payouts)
  }
)

export const PAYOUT_NOT_PENDING_MESSAGE = "Only a pending payout can be marked paid."

const markPayoutPaidStep = createStep(
  "mark-payout-paid",
  async (input: { id: string; reference: string }, { container }) => {
    const service = booking(container)
    const payout = await service.retrieveBookingPayout(input.id)
    if (payout.status !== "pending") {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, PAYOUT_NOT_PENDING_MESSAGE)
    }
    const commissions = await service.listBookingCommissions({ payout_id: payout.id })
    await service.updateBookingPayouts({ id: payout.id, status: "paid", paid_at: new Date(), reference: input.reference })
    if (commissions.length) {
      await service.updateBookingCommissions(commissions.map((c) => ({ id: c.id, status: "paid" as const })))
    }
    return new StepResponse(payout.id, { id: payout.id, commission_ids: commissions.map((c) => c.id) })
  },
  async (previous, { container }) => {
    if (!previous) {
      return
    }
    const service = booking(container)
    await service.updateBookingPayouts({ id: previous.id, status: "pending", paid_at: null, reference: null })
    if (previous.commission_ids.length) {
      await service.updateBookingCommissions(previous.commission_ids.map((id) => ({ id, status: "approved" as const })))
    }
  }
)

// The admin paid the partner outside Medusa.
export const markProviderPayoutPaidWorkflow = createWorkflow(
  "mark-provider-payout-paid",
  function (input: { id: string; reference: string }) {
    const key = transform(input, (i) => `provider-payout:${i.id}`)
    const ownerId = transform(input, () => `provider-payout-paid:${randomUUID()}`)
    acquireLockStep({ key, ownerId, timeout: 30, ttl: 120 })
    const id = markPayoutPaidStep(input)
    releaseLockStep({ key, ownerId })
    return new WorkflowResponse(id)
  }
)

export const NOT_TO_REVIEW_MESSAGE = "Only a commission held for a refund can be settled."

// The admin settles a held commission: keep it (the next payout pays it)
// or cancel it (nothing is owed for that booking).
const settleCommissionStep = createStep(
  "settle-commission",
  async (input: { id: string; action: "keep" | "cancel" }, { container }) => {
    const service = booking(container)
    const c = await service.retrieveBookingCommission(input.id)
    if (c.refund_review !== "to_review") {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, NOT_TO_REVIEW_MESSAGE)
    }
    await service.updateBookingCommissions({
      id: c.id,
      refund_review: "settled",
      ...(input.action === "cancel" && c.status === "pending" ? { status: "cancelled" as const } : {}),
    })
    return new StepResponse(c.id, { id: c.id, status: c.status })
  },
  async (previous, { container }) => {
    if (previous) {
      await booking(container).updateBookingCommissions({
        id: previous.id,
        refund_review: "to_review",
        status: previous.status as "pending",
      })
    }
  }
)

export const settleProviderCommissionWorkflow = createWorkflow(
  "settle-provider-commission",
  function (input: { id: string; action: "keep" | "cancel" }) {
    const ownerId = transform(input, () => `provider-commission-settle:${randomUUID()}`)
    acquireLockStep({ key: PAYOUTS_LOCK, ownerId, timeout: 30, ttl: 30 })
    const id = settleCommissionStep(input)
    releaseLockStep({ key: PAYOUTS_LOCK, ownerId })
    return new WorkflowResponse(id)
  }
)
