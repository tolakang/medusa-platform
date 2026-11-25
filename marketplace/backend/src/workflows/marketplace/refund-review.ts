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
import { PAYOUTS_LOCK, roundToCurrency } from "../../lib/vendor-commission"
import { MARKETPLACE_MODULE } from "../../modules/marketplace"
import type MarketplaceModuleService from "../../modules/marketplace/service"
import { CHILD_ORDERS_KEY, PARENT_ORDER_KEY } from "./create-vendor-orders"

// Refunds and vendor commissions (owner 2026-11-12, F-078: "hold and flag
// now, automate later"). A refund is taken on the parent order (it holds the
// payment), so it can't be matched to one vendor. A pending commission whose
// parent order has a refund is held out of payouts and flagged `to_review`
// until the admin settles it (keep, reduce or cancel).

/** Child order ids (of these) whose parent order has had a refund. */
export async function childOrdersWithRefundedParent(
  container: MedusaContainer,
  childOrderIds: string[]
): Promise<Set<string>> {
  if (!childOrderIds.length) {
    return new Set()
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: children } = await query.graph({
    entity: "order",
    fields: ["id", "metadata"],
    filters: { id: childOrderIds },
  })
  const parentOf = new Map(
    children
      .map((c) => [c.id, c.metadata?.[PARENT_ORDER_KEY] as string | undefined] as const)
      .filter(([, parent]) => !!parent) as [string, string][]
  )
  const parentIds = [...new Set(parentOf.values())]
  if (!parentIds.length) {
    return new Set()
  }
  // An order's `total` goes down after a refund; the payment collections
  // keep what was refunded (MEDUSA_SKILL §6).
  const { data: parents } = await query.graph({
    entity: "order",
    fields: ["id", "payment_collections.refunded_amount"],
    filters: { id: parentIds },
  })
  const refunded = new Set(
    parents
      .filter((p) =>
        (p.payment_collections ?? []).some((pc) =>
          MathBN.gt(pc?.refunded_amount ?? 0, 0)
        )
      )
      .map((p) => p.id)
  )
  return new Set([...parentOf].filter(([, parent]) => refunded.has(parent)).map(([child]) => child))
}

/**
 * A refund on a parent order flags its children's pending commissions for
 * review at once (payment.refunded). A commission already in a payout is
 * left alone and logged: it's settled with the vendor by hand.
 */
export async function flagRefundedParent(container: MedusaContainer, parentOrderId: string) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const {
    data: [parent],
  } = await query.graph({ entity: "order", fields: ["id", "metadata"], filters: { id: parentOrderId } })
  const childIds = (parent?.metadata?.[CHILD_ORDERS_KEY] ?? []) as string[]
  if (!childIds.length) {
    return { flagged: 0 }
  }
  const marketplace = container.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)
  const commissions = await marketplace.listVendorCommissions({ order_id: childIds })
  const pending = commissions.filter((c) => c.status === "pending")
  if (pending.length) {
    // Also a commission settled after an earlier refund: a new refund needs
    // a new look.
    await marketplace.updateVendorCommissions(
      pending.map((c) => ({ id: c.id, refund_review: "to_review" as const }))
    )
  }
  for (const c of commissions.filter((c) => c.status === "approved" || c.status === "paid")) {
    container
      .resolve(ContainerRegistrationKeys.LOGGER)
      .warn(
        `Order ${parentOrderId} has a refund, but vendor commission ${c.id} is already ${c.status} (payout ${c.payout_id}); settle it with the vendor by hand.`
      )
  }
  return { flagged: pending.length }
}

export const NOT_TO_REVIEW_MESSAGE = "This commission has no refund to review."
export const REDUCE_NEEDS_AMOUNT_MESSAGE =
  "Give the vendor's new amount, between 0 and what it is now."

export type SettleInput = {
  id: string
  action: "keep" | "reduce" | "cancel"
  payout_amount?: number
}

// The admin settles a held commission. keep: the vendor gets it as it is;
// reduce: the vendor gets less (payout_amount); cancel: the vendor gets
// nothing for this order. Kept or reduced, the next payout includes it.
const settleRefundReviewStep = createStep(
  "settle-refund-review",
  async (input: SettleInput, { container }) => {
    const marketplace = container.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)
    const commission = await marketplace.retrieveVendorCommission(input.id)
    if (commission.refund_review !== "to_review" || commission.status !== "pending") {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, NOT_TO_REVIEW_MESSAGE)
    }
    const before = {
      id: commission.id,
      status: commission.status,
      refund_review: commission.refund_review,
      payout_amount: Number(commission.payout_amount),
    }
    let payoutAmount: number | undefined
    if (input.action === "reduce") {
      const amount = input.payout_amount
      if (amount === undefined || amount < 0 || MathBN.gte(amount, commission.payout_amount)) {
        throw new MedusaError(MedusaError.Types.INVALID_DATA, REDUCE_NEEDS_AMOUNT_MESSAGE)
      }
      payoutAmount = roundToCurrency(amount, commission.currency_code)
    }
    const updated = await marketplace.updateVendorCommissions({
      id: commission.id,
      refund_review: "settled",
      ...(input.action === "cancel" ? { status: "cancelled" as const } : {}),
      ...(payoutAmount !== undefined ? { payout_amount: payoutAmount } : {}),
    })
    return new StepResponse(updated, before)
  },
  async (before, { container }) => {
    if (before) {
      await container
        .resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)
        .updateVendorCommissions(before)
    }
  }
)

export const settleRefundReviewWorkflow = createWorkflow(
  "settle-refund-review",
  function (input: SettleInput) {
    // One at a time with a payout run (review 2, S6).
    const ownerId = transform(input, () => `vendor-refund-settle:${randomUUID()}`)
    acquireLockStep({ key: PAYOUTS_LOCK, ownerId, timeout: 60, ttl: 30 })
    const result = settleRefundReviewStep(input)
    releaseLockStep({ key: PAYOUTS_LOCK, ownerId })
    return new WorkflowResponse(result)
  }
)

export type ParentState = { parent_id: string; canceled: boolean; captured: boolean }

/**
 * For each child order (of these), its parent order's state: cancelled, and
 * whether its payment is captured. A commission is only paid out once the
 * customer's payment is captured (pay later / authorized-only orders wait),
 * and never for a cancelled parent. "Captured" = the payment collections'
 * captured_amount covers their amount (MEDUSA_SKILL §6: with the system
 * provider a completed order is authorized, not captured, until
 * POST /admin/payments/:id/capture).
 */
export async function parentStates(
  container: MedusaContainer,
  childOrderIds: string[]
): Promise<Map<string, ParentState>> {
  const result = new Map<string, ParentState>()
  if (!childOrderIds.length) {
    return result
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data: children } = await query.graph({
    entity: "order",
    fields: ["id", "metadata"],
    filters: { id: [...new Set(childOrderIds)] },
  })
  const parentOf = new Map<string, string>()
  for (const c of children) {
    const parent = c.metadata?.[PARENT_ORDER_KEY] as string | undefined
    if (parent) {
      parentOf.set(c.id, parent)
    }
  }
  const parentIds = [...new Set(parentOf.values())]
  if (!parentIds.length) {
    return result
  }
  const { data: parents } = await query.graph({
    entity: "order",
    fields: [
      "id",
      "status",
      "payment_collections.status",
      "payment_collections.amount",
      "payment_collections.captured_amount",
    ],
    filters: { id: parentIds },
  })
  const byId = new Map(parents.map((p) => [p.id, p]))
  for (const [child, parentId] of parentOf) {
    const p = byId.get(parentId)
    if (!p) {
      continue
    }
    const collections = (p.payment_collections ?? []).filter(
      (pc) => pc && pc.status !== "canceled"
    )
    let amount = MathBN.convert(0)
    let captured = MathBN.convert(0)
    for (const pc of collections) {
      amount = MathBN.add(amount, pc!.amount ?? 0)
      captured = MathBN.add(captured, pc!.captured_amount ?? 0)
    }
    result.set(child, {
      parent_id: parentId,
      canceled: p.status === "canceled",
      captured: MathBN.gt(amount, 0) && MathBN.gte(captured, amount),
    })
  }
  return result
}

/**
 * A cancelled parent order: its children's pending commissions that the
 * cascade couldn't cancel (a fulfilled child) are held for the admin
 * (`to_review`, as a refund, F-078), so they're never paid automatically.
 */
export async function flagCanceledParent(container: MedusaContainer, childOrderIds: string[]) {
  if (!childOrderIds.length) {
    return { flagged: 0 }
  }
  const marketplace = container.resolve<MarketplaceModuleService>(MARKETPLACE_MODULE)
  const commissions = await marketplace.listVendorCommissions({ order_id: childOrderIds })
  const pending = commissions.filter(
    (c) => c.status === "pending" && c.refund_review !== "to_review"
  )
  if (pending.length) {
    await marketplace.updateVendorCommissions(
      pending.map((c) => ({ id: c.id, refund_review: "to_review" as const }))
    )
  }
  return { flagged: pending.length }
}
