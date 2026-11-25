import { ContainerRegistrationKeys, MathBN, MedusaError } from "@medusajs/framework/utils"
import { createStep, createWorkflow, StepResponse, transform, when, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { emitEventStep, refundPaymentWorkflow } from "@medusajs/medusa/core-flows"
import { cancelDecision } from "../lib/booking-cancel-policy"
import { PACKAGE_ITEM_KEY } from "../lib/packages"
import { EXTRA_FOR_KEY } from "../lib/booking-extras"
import { BOOKING_MODULE } from "../modules/booking"
import type BookingModuleService from "../modules/booking/service"
import type { RefundOutcome } from "./cancel-booking"

// TASKS P3-30: cancel an event package, all its pieces together. The policy
// (BOOKING_CANCEL_HOURS, P3-08) is read from the earliest piece: cancelled in
// time, the package's lines still on are refunded from the order's captured
// payment (the pieces are $0). The refund runs last, with an idempotency key.

export const PACKAGE_NOT_FOUND_MESSAGE = "This event package was not found."

// After a cancellation; when staff did it, the customer is emailed (P3-30).
export const PACKAGE_CANCELLED_EVENT = "booking.package_cancelled"
export type PackageCancelledData = { package_id: string; by: "customer" | "staff"; refunded_amount: number }

type Plan = {
  package_id: string
  previous: { id: string; status: string; hold_expires_at: string | null }[]
  outcome: RefundOutcome
  refund: { payment_id: string; amount: number; idempotency_key: string; note: string } | null
}

type Money = number | string | { toJSON?: () => unknown } | null | undefined
const num = (v: Money): number => (v === null || v === undefined ? 0 : MathBN.convert(v as number).toNumber())

const planPackageCancelStep = createStep(
  "plan-package-cancel",
  async (input: { package_id: string; customer_id?: string }, { container }) => {
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const service = container.resolve<BookingModuleService>(BOOKING_MODULE)
    const { data: pieces } = await query.graph({
      entity: "booking",
      fields: ["id", "status", "starts_at", "customer_id", "hold_expires_at", "order.id"],
      filters: { package_id: input.package_id, status: ["pending", "confirmed"] },
    })
    if (!pieces.length || (input.customer_id !== undefined && pieces.some((p) => p.customer_id !== input.customer_id))) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, PACKAGE_NOT_FOUND_MESSAGE)
    }
    const first = [...pieces].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0]
    // Staff cancels always refund (owner decision, 2026-11-25; see cancel-booking).
    const decision = cancelDecision(first, new Date(), service.cancelHours, { byStaff: input.customer_id === undefined })
    const inWindow = cancelDecision(first, new Date(), service.cancelHours)
    if (!decision.allowed) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, decision.message)
    }
    const previous = pieces.map((p) => ({
      id: p.id,
      status: p.status,
      hold_expires_at: p.hold_expires_at ? new Date(p.hold_expires_at).toISOString() : null,
    }))
    const plan = (outcome: RefundOutcome, refund: Plan["refund"] = null): Plan => ({ package_id: input.package_id, previous, outcome, refund })

    const orderId = pieces.find((p) => p.order?.id)?.order?.id
    if (!orderId) return new StepResponse(plan("no_order"))
    if (!decision.refund) return new StepResponse(plan("outside_policy"))
    // Totals come with a top-level total field (see cancel-booking).
    const {
      data: [order],
    } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "total",
        "items.metadata",
        "items.total",
        "payment_collections.payments.id",
        "payment_collections.payments.captures.amount",
        "payment_collections.payments.refunds.amount",
      ],
      filters: { id: orderId },
    })
    // The package line and the pieces still on (an à la carte piece staff
    // already cancelled was refunded then: review finding), with their extras.
    const live = new Set(pieces.map((p) => p.id))
    const amount = (order?.items ?? [])
      .filter((i) => {
        const m = (i?.metadata ?? {}) as Record<string, unknown>
        if (m[PACKAGE_ITEM_KEY] === input.package_id) return !m.booking_id || live.has(m.booking_id as string)
        return typeof m[EXTRA_FOR_KEY] === "string" && live.has(m[EXTRA_FOR_KEY] as string)
      })
      .reduce((s, i) => s + num(i?.total as Money), 0)
    const payment = (order?.payment_collections ?? [])
      .flatMap((c) => c?.payments ?? [])
      .filter(Boolean)
      .map((p) => ({
        id: p!.id,
        available:
          (p!.captures ?? []).reduce((s, c) => s + num(c?.amount as Money), 0) -
          (p!.refunds ?? []).reduce((s, r) => s + num(r?.amount as Money), 0),
      }))
      .sort((a, b) => b.available - a.available)[0]
    if (!payment || payment.available <= 0 || amount <= 0) return new StepResponse(plan("not_captured"))
    return new StepResponse(
      plan("refunded", {
        payment_id: payment.id,
        amount: Math.min(amount, payment.available),
        idempotency_key: `booking_package_cancel_${input.package_id}`,
        note:
          inWindow.allowed && inWindow.refund
            ? `Event package ${input.package_id} cancelled within the cancellation policy.`
            : `Event package ${input.package_id} cancelled by the shop: refunded in full.`,
      })
    )
  }
)

const markPackageCancelledStep = createStep(
  "mark-package-cancelled",
  async (plan: Plan, { container }) => {
    await container
      .resolve<BookingModuleService>(BOOKING_MODULE)
      .updateBookings(plan.previous.map((p) => ({ id: p.id, status: "cancelled" as const, hold_expires_at: null })))
    return new StepResponse(plan.previous.length, plan.previous)
  },
  async (previous, { container }) => {
    if (!previous?.length) return
    await container.resolve<BookingModuleService>(BOOKING_MODULE).updateBookings(
      previous.map((p) => ({
        id: p.id,
        status: p.status as "confirmed",
        hold_expires_at: p.hold_expires_at ? new Date(p.hold_expires_at) : null,
      }))
    )
  }
)

export const cancelPackageWorkflow = createWorkflow(
  "cancel-package",
  function (input: { package_id: string; customer_id?: string; created_by?: string; by?: "customer" | "staff" }) {
    const plan = planPackageCancelStep(input)
    const cancelled = markPackageCancelledStep(plan)
    emitEventStep({
      eventName: PACKAGE_CANCELLED_EVENT,
      data: transform({ plan, input }, ({ plan, input }): PackageCancelledData => ({
        package_id: plan.package_id,
        by: input.by ?? (input.customer_id ? "customer" : "staff"),
        refunded_amount: plan.refund?.amount ?? 0,
      })),
    })
    // The refund runs last (review finding): nothing after it can fail.
    when("refund-cancelled-package", plan, (p) => p.refund !== null).then(() => {
      refundPaymentWorkflow.runAsStep({
        input: transform({ plan, input }, ({ plan, input }) => ({
          payment_id: plan.refund!.payment_id,
          amount: plan.refund!.amount,
          idempotency_key: plan.refund!.idempotency_key,
          note: plan.refund!.note,
          created_by: input.created_by,
        })),
      })
    })
    return new WorkflowResponse(
      transform({ plan, cancelled }, ({ plan, cancelled }) => ({
        cancelled,
        refund: plan.outcome,
        refunded_amount: plan.refund?.amount ?? 0,
      }))
    )
  }
)
