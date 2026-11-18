import { TELEGRAM_TEXT_TEMPLATE } from "@medusa-platform/medusa-core/lib/telegram/templates"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createStep, createWorkflow, StepResponse, when, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { sendNotificationsStep } from "@medusajs/medusa/core-flows"
import { jobMessage, type JobData, type JobKind } from "../lib/booking-job"

// TASKS P3-28: the job goes to whoever's calendar it's on, on Telegram: to
// the calendar's own chat with the staff bot (`telegram_chat_id`, channel
// telegram_staff), else to the staff group (channel telegram) with the
// calendar's name. Sent for a new confirmed booking and for every move; a
// move to another calendar also tells the old one.

export const STAFF_DIRECT_CHANNEL = "telegram_staff"

export type BookingJobInput = {
  jobs: {
    booking_id: string
    kind: "new" | "moved"
    // Before a move.
    previous?: { resource_id: string; starts_at: string; ends_at: string } | null
  }[]
}

type Notice = { to: string; channel: string; template: string; data: { text: string }; idempotency_key: string }

const buildBookingJobsStep = createStep("build-booking-jobs", async (input: BookingJobInput, { container }) => {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const ids = input.jobs.map((j) => j.booking_id)
  if (!ids.length) return new StepResponse([] as Notice[])
  const { data: bookings } = await query.graph({
    entity: "booking",
    fields: [
      "id", "starts_at", "ends_at", "customer_id", "notes", "address", "dropoff_address", "seats",
      "resource.id", "resource.name", "resource.timezone", "resource.telegram_chat_id",
      "order.display_id", "order.items.product_title", "order.items.metadata",
    ],
    filters: { id: ids },
  })
  const customerIds = [...new Set(bookings.map((b) => b.customer_id).filter(Boolean) as string[])]
  const { data: customers } = customerIds.length
    ? await query.graph({ entity: "customer", fields: ["id", "first_name", "last_name", "phone"], filters: { id: customerIds } })
    : { data: [] }
  const previousIds = [...new Set(input.jobs.map((j) => j.previous?.resource_id).filter(Boolean) as string[])]
  const { data: previousResources } = previousIds.length
    ? await query.graph({ entity: "booking_resource", fields: ["id", "name", "timezone", "telegram_chat_id"], filters: { id: previousIds } })
    : { data: [] }

  type Calendar = { id: string; name: string; timezone: string; telegram_chat_id?: string | null }
  const notice = (calendar: Calendar, job: JobData, key: string): Notice => {
    const direct = calendar.telegram_chat_id
    return {
      to: direct || "staff",
      channel: direct ? STAFF_DIRECT_CHANNEL : "telegram",
      template: TELEGRAM_TEXT_TEMPLATE,
      // The staff group sees whose job it is.
      data: { text: direct ? jobMessage(job) : `👤 ${calendar.name}\n${jobMessage(job)}` },
      idempotency_key: key,
    }
  }

  const notices: Notice[] = []
  for (const j of input.jobs) {
    const b = bookings.find((x) => x.id === j.booking_id)
    if (!b?.resource) continue
    const c = customers.find((x) => x.id === b.customer_id) as
      | { first_name?: string | null; last_name?: string | null; phone?: string | null }
      | undefined
    const item = (b.order?.items ?? []).find((i) => (i?.metadata as Record<string, unknown> | null)?.booking_id === b.id)
    const resource = b.resource as unknown as Calendar
    const starts = new Date(b.starts_at).toISOString()
    const ends = new Date(b.ends_at).toISOString()
    const prev = j.previous ? (previousResources as Calendar[]).find((r) => r.id === j.previous!.resource_id) : undefined
    const job: JobData = {
      kind: j.kind as JobKind,
      calendar: resource.name,
      timezone: resource.timezone,
      starts_at: starts,
      ends_at: ends,
      service: item?.product_title ?? null,
      customer: [c?.first_name, c?.last_name].filter(Boolean).join(" ") || null,
      phone: c?.phone ?? null,
      address: b.address,
      dropoff_address: b.dropoff_address,
      seats: b.seats,
      notes: b.notes,
      order: b.order?.display_id != null ? Number(b.order.display_id) : null,
      previous: j.previous && prev ? { calendar: prev.name, starts_at: j.previous.starts_at } : null,
    }
    const key = `booking_job_${b.id}_${j.kind}_${resource.id}_${starts}`
    notices.push(notice(resource, job, key))
    if (prev && prev.id !== resource.id) {
      notices.push(
        notice(
          prev,
          { ...job, kind: "removed", calendar: prev.name, timezone: prev.timezone, starts_at: j.previous!.starts_at, ends_at: j.previous!.ends_at, previous: null },
          `booking_job_${b.id}_removed_${prev.id}_${j.previous!.starts_at}`
        )
      )
    }
  }
  return new StepResponse(notices)
})

export const sendBookingJobsWorkflow = createWorkflow("send-booking-jobs", function (input: BookingJobInput) {
  const notices = buildBookingJobsStep(input)
  when("any-booking-job", notices, (n) => n.length > 0).then(() => {
    sendNotificationsStep(notices)
  })
  return new WorkflowResponse(notices)
})
