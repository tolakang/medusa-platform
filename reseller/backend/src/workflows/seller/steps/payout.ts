import { MedusaError } from "@medusajs/framework/utils"
import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { SELLER_MODULE } from "../../../modules/seller"
import { netPayoutLines } from "../../../modules/seller/payout"
import SellerModuleService from "../../../modules/seller/service"

/**
 * TASKS P5-05: pending commissions recorded before the cutoff become
 * approved (due in this payout). Running it again finds nothing new.
 */
// REVIEW_FIXES B10: a refund adjusts a commission under the per-order lock
// `seller-commission:<order_id>`. A payout used to list commissions and then
// update them without it, so a commission a refund had just cancelled could
// be marked paid. The payout workflows now lock the same keys (found by the
// steps below), and these steps read the statuses again inside the lock.

/** The lock keys of the commissions a payout would change. */
export const payoutLockKeysStep = createStep(
  "seller-payout-lock-keys",
  async (
    input: { status: "pending" | "approved"; cutoff?: Date; seller_id?: string; currency_code?: string },
    { container }
  ) => {
    const rows = await container
      .resolve<SellerModuleService>(SELLER_MODULE)
      .listSellerCommissions({
        status: input.status,
        ...(input.cutoff ? { created_at: { $lt: input.cutoff } } : {}),
        ...(input.seller_id ? { seller_id: input.seller_id } : {}),
        ...(input.currency_code ? { currency_code: input.currency_code } : {}),
      })
    // Never empty: one key for the payout itself, so two payouts of the same
    // kind don't run at once either.
    return new StepResponse([
      `seller-payout:${input.seller_id ?? "batch"}`,
      ...rows.map((row) => `seller-commission:${row.order_id}`),
    ])
  }
)

/**
 * The payout day approves every seller's due commissions except those of
 * sellers on hold; the owner's "Approve now" (seller_id) approves one seller's
 * pending commissions up to now, hold or not.
 */
export const approveDueCommissionsStep = createStep(
  "approve-due-seller-commissions",
  async (input: { cutoff: Date; seller_id?: string }, { container }) => {
    const sellers = container.resolve<SellerModuleService>(SELLER_MODULE)
    const held = input.seller_id
      ? []
      : (await sellers.listSellers({ payout_hold: true }, { select: ["id"] })).map((s) => s.id)
    // Read inside the lock: a refund may have cancelled some since.
    const due = (
      await sellers.listSellerCommissions({
        status: "pending",
        created_at: { $lt: input.cutoff },
        ...(input.seller_id ? { seller_id: input.seller_id } : {}),
      })
    ).filter((commission) => !held.includes(commission.seller_id))
    if (!due.length) {
      return new StepResponse([], [] as string[])
    }
    const approved = await sellers.updateSellerCommissions(
      due.map((commission) => ({ id: commission.id, status: "approved" as const }))
    )
    return new StepResponse(approved, due.map((commission) => commission.id))
  },
  async (ids: string[] | undefined, { container }) => {
    if (!ids?.length) {
      return
    }
    await container
      .resolve<SellerModuleService>(SELLER_MODULE)
      .updateSellerCommissions(ids.map((id) => ({ id, status: "pending" as const })))
  }
)

/**
 * TASKS P5-05: the shop paid a seller; their approved commissions become
 * paid. Only approved ones: pending commissions aren't due yet.
 */
export const NEGATIVE_PAYOUT_MESSAGE =
  "Clawbacks are more than the approved commissions, so nothing is due yet. They carry into the next payout."

type PaidUndo = { commission_ids: string[]; adjustment_ids: string[]; payout_ids: string[] }

/**
 * Also settles the seller's open adjustments (clawbacks) in the same
 * currencies and records one payout per currency, with the bank/ABA
 * reference, for the payout history.
 */
export const markSellerCommissionsPaidStep = createStep(
  "mark-seller-commissions-paid",
  async (
    input: { seller_id: string; currency_code?: string; paid_at: Date; reference?: string | null },
    { container }
  ) => {
    const sellers = container.resolve<SellerModuleService>(SELLER_MODULE)
    // Read inside the lock: a refund may have cancelled or changed some since.
    const approved = await sellers.listSellerCommissions({
      seller_id: input.seller_id,
      status: "approved",
      ...(input.currency_code ? { currency_code: input.currency_code } : {}),
    })
    const undo: PaidUndo = { commission_ids: [], adjustment_ids: [], payout_ids: [] }
    if (!approved.length) {
      return new StepResponse({ paid: [] as typeof approved, payouts: [] as { id: string }[] }, undo)
    }
    const currencies = [...new Set(approved.map((c) => c.currency_code))]
    const adjustments = await sellers.listSellerAdjustments({
      seller_id: input.seller_id,
      status: "open",
      currency_code: currencies,
    })
    const lines = netPayoutLines(
      approved.map((c) => ({ seller_id: c.seller_id, currency_code: c.currency_code, amount: Number(c.amount) })),
      adjustments.map((a) => ({ seller_id: a.seller_id, currency_code: a.currency_code, amount: Number(a.amount) }))
    )
    if (lines.some((line) => line.net < 0)) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, NEGATIVE_PAYOUT_MESSAGE)
    }

    const payouts = await sellers.createSellerPayouts(
      lines.map((line) => ({
        seller_id: input.seller_id,
        currency_code: line.currency_code,
        amount: line.net,
        commission_total: line.amount,
        adjustment_total: line.adjustment,
        commission_count: line.count,
        reference: input.reference?.trim() || null,
        paid_at: input.paid_at,
      }))
    )
    undo.payout_ids = payouts.map((p) => p.id)
    const payoutByCurrency = new Map(payouts.map((p) => [p.currency_code, p.id]))
    if (adjustments.length) {
      await sellers.updateSellerAdjustments(
        adjustments.map((a) => ({
          id: a.id,
          status: "settled" as const,
          payout_id: payoutByCurrency.get(a.currency_code) ?? null,
        }))
      )
      undo.adjustment_ids = adjustments.map((a) => a.id)
    }
    const paid = await sellers.updateSellerCommissions(
      approved.map((commission) => ({
        id: commission.id,
        status: "paid" as const,
        paid_at: input.paid_at,
      }))
    )
    undo.commission_ids = approved.map((commission) => commission.id)
    return new StepResponse({ paid, payouts }, undo)
  },
  async (undo: PaidUndo | undefined, { container }) => {
    if (!undo) {
      return
    }
    const sellers = container.resolve<SellerModuleService>(SELLER_MODULE)
    if (undo.commission_ids.length) {
      await sellers.updateSellerCommissions(
        undo.commission_ids.map((id) => ({ id, status: "approved" as const, paid_at: null }))
      )
    }
    if (undo.adjustment_ids.length) {
      await sellers.updateSellerAdjustments(
        undo.adjustment_ids.map((id) => ({ id, status: "open" as const, payout_id: null }))
      )
    }
    if (undo.payout_ids.length) {
      await sellers.deleteSellerPayouts(undo.payout_ids)
    }
  }
)
