import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { createStep, createWorkflow, StepResponse, transform, when, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { sendNotificationsStep } from "@medusajs/medusa/core-flows"
import { DEFAULT_QUOTE_VALID_DAYS, isQuoteOnly, QUOTE_ITEM_KEY, QUOTE_NOT_OPEN_MESSAGE, QUOTE_NOT_YOURS_MESSAGE, QUOTE_TEMPLATE } from "../lib/quotes"
import { BOOKING_MODULE } from "../modules/booking"
import type BookingModuleService from "../modules/booking/service"

// Quote first (TASKS P3-27): a customer asks, staff price it (calendar, time,
// amount, reply) and the customer is emailed; the accepted quote is booked
// into the cart at that price (add-booking-to-cart with quote_id) and marked
// accepted when its order is placed.

const service = (c: { resolve: (k: string) => unknown }) => c.resolve(BOOKING_MODULE) as BookingModuleService

export const NOT_QUOTE_ONLY_MESSAGE = "This service can be booked straight away; it doesn't need a quote."
export const QUOTE_RESOURCE_MESSAGE = "Choose a calendar that offers this service."

export type RequestQuoteInput = {
  customer_id: string
  variant_id: string
  details: string
  wished_starts_at: string
  address?: string | null
  dropoff_address?: string | null
}

const requestQuoteStep = createStep(
  "request-quote",
  async (input: RequestQuoteInput, { container }) => {
    const {
      data: [variant],
    } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
      entity: "product_variant",
      fields: ["id", "product.metadata"],
      filters: { id: input.variant_id },
    })
    if (!variant || !isQuoteOnly(variant.product)) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, NOT_QUOTE_ONLY_MESSAGE)
    }
    const quote = await service(container).createBookingQuotes({
      customer_id: input.customer_id,
      variant_id: input.variant_id,
      details: input.details.trim(),
      wished_starts_at: new Date(input.wished_starts_at),
      address: input.address?.trim() || null,
      dropoff_address: input.dropoff_address?.trim() || null,
    })
    return new StepResponse(quote, quote.id)
  },
  async (id, { container }) => {
    if (id) await service(container).deleteBookingQuotes(id)
  }
)

export const requestBookingQuoteWorkflow = createWorkflow("request-booking-quote", function (input: RequestQuoteInput) {
  return new WorkflowResponse(requestQuoteStep(input))
})

export type SendQuoteInput = {
  id: string
  amount: number
  currency_code: string
  resource_id: string
  starts_at: string
  duration_minutes: number
  reply?: string | null
  valid_days?: number
}

type Sent = { email: string | null; data: Record<string, unknown> | null; id: string }

const sendQuoteStep = createStep(
  "send-quote",
  async (input: SendQuoteInput, { container }) => {
    const booking = service(container)
    const [quote] = await booking.listBookingQuotes({ id: input.id })
    if (!quote) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, QUOTE_NOT_YOURS_MESSAGE)
    }
    if (quote.status !== "requested" && quote.status !== "quoted") {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, QUOTE_NOT_OPEN_MESSAGE)
    }
    const query = container.resolve(ContainerRegistrationKeys.QUERY)
    const {
      data: [resource],
    } = await query.graph({
      entity: "booking_resource",
      fields: ["id", "name", "timezone", "product_variants.id"],
      filters: { id: input.resource_id },
    })
    if (!resource || !(resource.product_variants ?? []).some((v) => v?.id === quote.variant_id)) {
      throw new MedusaError(MedusaError.Types.INVALID_DATA, QUOTE_RESOURCE_MESSAGE)
    }
    const starts = new Date(input.starts_at)
    const ends = new Date(starts.getTime() + input.duration_minutes * 60_000)
    const validUntil = new Date(Date.now() + (input.valid_days ?? DEFAULT_QUOTE_VALID_DAYS) * 86_400_000)
    const before = {
      id: quote.id,
      status: quote.status,
      amount: quote.amount === null ? null : Number(quote.amount),
      currency_code: quote.currency_code,
      resource_id: quote.resource_id,
      starts_at: quote.starts_at,
      ends_at: quote.ends_at,
      reply: quote.reply,
      valid_until: quote.valid_until,
    }
    await booking.updateBookingQuotes({
      id: quote.id,
      status: "quoted",
      amount: input.amount,
      currency_code: input.currency_code,
      resource_id: resource.id,
      starts_at: starts,
      ends_at: ends,
      reply: input.reply?.trim() || null,
      valid_until: validUntil,
    })
    const {
      data: [customer],
    } = await query.graph({ entity: "customer", fields: ["email", "first_name", "last_name"], filters: { id: quote.customer_id } })
    const {
      data: [variant],
    } = await query.graph({ entity: "product_variant", fields: ["title", "product.title"], filters: { id: quote.variant_id } })
    const when = new Intl.DateTimeFormat("en-GB", {
      timeZone: resource.timezone,
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(starts)
    const config = container.resolve(ContainerRegistrationKeys.CONFIG_MODULE)
    const shop = (config.admin as { storefrontUrl?: string } | undefined)?.storefrontUrl || process.env.STOREFRONT_URL
    return new StepResponse<Sent, typeof before>(
      {
        id: quote.id,
        email: customer?.email ?? null,
        data: {
          customer_name: [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || null,
          service: variant?.product?.title ?? variant?.title ?? "your service",
          amount: input.amount,
          currency_code: input.currency_code,
          when: `${when} (${resource.name})`,
          reply: input.reply?.trim() || null,
          valid_until: validUntil.toISOString().slice(0, 10),
          url: shop ? `${shop.replace(/\/+$/, "")}/account/quotes` : null,
        },
      },
      before
    )
  },
  async (before, { container }) => {
    if (before) {
      await service(container).updateBookingQuotes(before as never)
    }
  }
)

export const sendBookingQuoteWorkflow = createWorkflow("send-booking-quote", function (input: SendQuoteInput) {
  const sent = sendQuoteStep(input)
  when("email-quote", sent, (s) => !!s.email).then(() => {
    sendNotificationsStep(
      transform({ sent, input }, ({ sent, input }) => [
        {
          to: sent.email!,
          channel: "email",
          template: QUOTE_TEMPLATE,
          data: sent.data!,
          // A new price is a new email.
          idempotency_key: `booking_quote_${sent.id}_${input.amount}_${input.starts_at}`,
        },
      ])
    )
  })
  return new WorkflowResponse(sent)
})

const declineQuoteStep = createStep(
  "decline-quote",
  async (input: { id: string; customer_id?: string }, { container }) => {
    const booking = service(container)
    const [quote] = await booking.listBookingQuotes({ id: input.id, ...(input.customer_id ? { customer_id: input.customer_id } : {}) })
    if (!quote) {
      throw new MedusaError(MedusaError.Types.NOT_FOUND, QUOTE_NOT_YOURS_MESSAGE)
    }
    if (quote.status !== "requested" && quote.status !== "quoted") {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, QUOTE_NOT_OPEN_MESSAGE)
    }
    await booking.updateBookingQuotes({ id: quote.id, status: "declined" })
    return new StepResponse(quote.id, { id: quote.id, status: quote.status })
  },
  async (before, { container }) => {
    if (before) await service(container).updateBookingQuotes(before as never)
  }
)

export const declineBookingQuoteWorkflow = createWorkflow("decline-booking-quote", function (input: { id: string; customer_id?: string }) {
  return new WorkflowResponse(declineQuoteStep(input))
})

// When an order with a quoted booking is placed, the quote is accepted.
const acceptPaidQuotesStep = createStep("accept-paid-quotes", async (input: { order_id: string }, { container }) => {
  const {
    data: [order],
  } = await container.resolve(ContainerRegistrationKeys.QUERY).graph({
    entity: "order",
    fields: ["id", "items.metadata"],
    filters: { id: input.order_id },
  })
  const booking = service(container)
  let accepted = 0
  for (const item of order?.items ?? []) {
    const meta = (item?.metadata ?? {}) as Record<string, unknown>
    const id = meta[QUOTE_ITEM_KEY]
    if (typeof id === "string") {
      await booking.updateBookingQuotes({ id, status: "accepted", booking_id: (meta.booking_id as string) ?? null })
      accepted++
    }
  }
  return new StepResponse(accepted)
})

export const acceptPaidQuotesWorkflow = createWorkflow("accept-paid-quotes", function (input: { order_id: string }) {
  return new WorkflowResponse(acceptPaidQuotesStep(input))
})
