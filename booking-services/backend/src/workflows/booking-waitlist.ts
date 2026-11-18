import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { createStep, createWorkflow, StepResponse, transform, when, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { sendNotificationsStep } from "@medusajs/medusa/core-flows"
import { freeSlotsForVariant } from "../lib/variant-slots"
import {
  localDate,
  WAITLIST_DATE_MESSAGE,
  WAITLIST_FREE_MESSAGE,
  WAITLIST_SERVICE_MESSAGE,
  WAITLIST_TEMPLATE,
  waitlistDateOk,
  type WaitlistEmailData,
  waitlistService,
} from "../lib/waitlist"
import { BOOKING_MODULE } from "../modules/booking"
import type BookingModuleService from "../modules/booking/service"
import { defaultTimezone } from "./booking-resource"

// Waitlist (TASKS P3-29). Join: a signed-in customer, a time-slot service, a
// day from today on with no free time (once per service and day). The job
// (every 15 minutes) emails everyone waiting for a day that has a free time
// again, once; the first to book gets it.

const service = (c: { resolve: (k: string) => unknown }) => c.resolve(BOOKING_MODULE) as BookingModuleService

export type JoinWaitlistInput = { customer_id: string; variant_id: string; date: string }

const joinWaitlistStep = createStep(
  "join-waitlist",
  async (input: JoinWaitlistInput, { container }) => {
    if (!waitlistDateOk(input.date, new Date(), defaultTimezone())) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, WAITLIST_DATE_MESSAGE)
    }
    const {
      data: [variant],
    } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
      entity: "product_variant",
      fields: ["id", "product.metadata"],
      filters: { id: input.variant_id },
    })
    if (!variant || !waitlistService(variant.product?.metadata as Record<string, unknown> | null)) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, WAITLIST_SERVICE_MESSAGE)
    }
    const { slots } = await freeSlotsForVariant(container, { variant_id: input.variant_id, date: input.date })
    if (slots.length) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, WAITLIST_FREE_MESSAGE)
    }
    const [already] = await service(container).listBookingWaitlists({ ...input, status: "waiting" })
    if (already) {
      return new StepResponse(already, null)
    }
    const entry = await service(container).createBookingWaitlists(input)
    return new StepResponse(entry, entry.id)
  },
  async (id, { container }) => {
    if (id) await service(container).deleteBookingWaitlists(id)
  }
)

export const joinWaitlistWorkflow = createWorkflow("join-waitlist", function (input: JoinWaitlistInput) {
  return new WorkflowResponse(joinWaitlistStep(input))
})

const leaveWaitlistStep = createStep(
  "leave-waitlist",
  async (input: { id: string; customer_id: string }, { container }) => {
    const [entry] = await service(container).listBookingWaitlists({ id: input.id, customer_id: input.customer_id })
    if (!entry) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, "This waitlist entry was not found.")
    }
    await service(container).updateBookingWaitlists({ id: entry.id, status: "cancelled" })
    return new StepResponse(entry.id, { id: entry.id, status: entry.status })
  },
  async (before, { container }) => {
    if (before) await service(container).updateBookingWaitlists(before as never)
  }
)

export const leaveWaitlistWorkflow = createWorkflow("leave-waitlist", function (input: { id: string; customer_id: string }) {
  return new WorkflowResponse(leaveWaitlistStep(input))
})

type Notice = { to: string; channel: string; template: string; data: WaitlistEmailData; idempotency_key: string }

const findFreedStep = createStep("find-freed", async (input: { now?: string }, { container }) => {
  const now = input.now ? new Date(input.now) : new Date()
  const today = localDate(now, defaultTimezone())
  const booking = service(container)
  const waiting = (await booking.listBookingWaitlists({ status: "waiting" })).filter((w) => w.date >= today)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const shop = process.env.STOREFRONT_URL?.replace(/\/+$/, "")
  const notices: Notice[] = []
  const notified: string[] = []
  // One look per service and day.
  const groups = new Map<string, typeof waiting>()
  for (const w of waiting) {
    const key = `${w.variant_id}|${w.date}`
    groups.set(key, [...(groups.get(key) ?? []), w])
  }
  for (const [key, entries] of groups) {
    const [variant_id, date] = key.split("|")
    // A service removed since: skip it.
    const slots = await freeSlotsForVariant(container, { variant_id, date })
      .then((r) => r.slots)
      .catch(() => [] as Awaited<ReturnType<typeof freeSlotsForVariant>>["slots"])
    const upcoming = slots.filter((s) => Date.parse(s.starts_at) > now.getTime())
    if (!upcoming.length) continue
    const {
      data: [variant],
    } = await query.graph({ entity: "product_variant", fields: ["product.title", "product.handle"], filters: { id: variant_id } })
    const { data: customers } = await query.graph({
      entity: "customer",
      fields: ["id", "email", "first_name", "last_name"],
      filters: { id: entries.map((e) => e.customer_id) },
    })
    const times = [
      ...new Set(
        upcoming.map((s) =>
          new Intl.DateTimeFormat("en-GB", { timeZone: s.timezone ?? defaultTimezone(), hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
            new Date(s.starts_at)
          )
        )
      ),
    ].slice(0, 8)
    for (const e of entries) {
      const c = customers.find((x) => x.id === e.customer_id)
      notified.push(e.id)
      if (!c?.email) continue
      notices.push({
        to: c.email,
        channel: "email",
        template: WAITLIST_TEMPLATE,
        data: {
          customer_name: [c.first_name, c.last_name].filter(Boolean).join(" ") || null,
          service: variant?.product?.title ?? "Your service",
          date,
          times,
          url: shop && variant?.product?.handle ? `${shop}/products/${variant.product.handle}` : null,
        },
        idempotency_key: `booking_waitlist_${e.id}`,
      })
    }
  }
  if (notified.length) {
    await booking.updateBookingWaitlists(notified.map((id) => ({ id, status: "notified" as const, notified_at: now })))
  }
  return new StepResponse(notices, notified)
}, async (notified, { container }) => {
  if (notified?.length) {
    await service(container).updateBookingWaitlists(notified.map((id) => ({ id, status: "waiting" as const, notified_at: null })))
  }
})

export const notifyWaitlistWorkflow = createWorkflow("notify-waitlist", function (input: { now?: string }) {
  const notices = findFreedStep(input)
  when("any-waitlist-notice", notices, (n) => n.length > 0).then(() => {
    sendNotificationsStep(transform({ notices }, ({ notices }) => notices))
  })
  return new WorkflowResponse(notices)
})
