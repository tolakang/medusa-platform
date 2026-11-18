import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createStep, createWorkflow, StepResponse, transform, when, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { sendNotificationsStep } from "@medusajs/medusa/core-flows"
import { BALANCE_METADATA_KEY, BALANCE_TEMPLATE, reminderDays } from "../lib/deposits"

// Balance reminders (TASKS P3-26): once, BOOKING_BALANCE_REMINDER_DAYS (default
// 2) before the first booking of an order whose balance isn't paid yet, an
// email says what is due. The collection's metadata.reminded_at records it,
// and the email has an idempotency key per collection.

type Due = { collection_id: string; email: string; data: Record<string, unknown> }

const dueRemindersStep = createStep("due-reminders", async (input: { now?: string }, { container }) => {
  const now = input.now ? new Date(input.now) : new Date()
  const until = new Date(now.getTime() + reminderDays() * 86_400_000)
  const { data } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "payment_collection",
    fields: ["id", "amount", "currency_code", "status", "metadata", "order.id", "order.email", "order.display_id", "order.customer.first_name", "order.customer.last_name", "order.bookings.status"],
    filters: { status: ["not_paid", "awaiting"] },
  })
  const due: Due[] = []
  for (const c of data) {
    const meta = (c.metadata ?? {}) as Record<string, unknown>
    const order = (
      c as unknown as {
        order?: { email?: string; display_id?: number; customer?: { first_name?: string; last_name?: string }; bookings?: { status: string }[] }
      }
    ).order
    if (!meta[BALANCE_METADATA_KEY] || meta.reminded_at || !order?.email || typeof meta.due_at !== "string") {
      continue
    }
    // Every booking of the order cancelled (one booking, or a whole event
    // package, P3-30): nothing is due any more.
    const bookings = order.bookings ?? []
    if (bookings.length && bookings.every((b) => b.status === "cancelled")) {
      continue
    }
    const at = new Date(meta.due_at)
    if (at <= now || at > until) {
      continue
    }
    const name = [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(" ")
    due.push({
      collection_id: c.id,
      email: order.email,
      data: {
        order_display_id: order.display_id ?? null,
        customer_name: name || null,
        amount: Number(c.amount),
        currency_code: c.currency_code,
        due_at: meta.due_at,
        instalment: typeof meta.instalment === "number" ? meta.instalment : null,
      },
    })
  }
  return new StepResponse(due)
})

const markRemindedStep = createStep("mark-reminded", async (due: Due[], { container }) => {
  const payment = container.resolve(Modules.PAYMENT)
  const at = new Date().toISOString()
  for (const d of due) {
    const [c] = await payment.listPaymentCollections({ id: d.collection_id })
    await payment.updatePaymentCollections(d.collection_id, { metadata: { ...(c?.metadata ?? {}), reminded_at: at } })
  }
  return new StepResponse(due.length)
})

export const sendBalanceRemindersWorkflow = createWorkflow("send-balance-reminders", function (input: { now?: string }) {
  const due = dueRemindersStep(input)
  when("any-balance-due", due, (d) => d.length > 0).then(() => {
    sendNotificationsStep(
      transform({ due }, ({ due }) =>
        due.map((d) => ({
          to: d.email,
          channel: "email",
          template: BALANCE_TEMPLATE,
          data: d.data,
          idempotency_key: `booking_balance_reminder_${d.collection_id}`,
        }))
      )
    )
    markRemindedStep(due)
  })
  return new WorkflowResponse(due)
})
