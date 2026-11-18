import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { confirmOrderBookingsWorkflow } from "../workflows/confirm-order-bookings"
import { recordProviderCommissionsWorkflow } from "../workflows/provider-commission"
import { issueEventTicketsWorkflow } from "../workflows/issue-event-tickets"
import { createBookingBalanceWorkflow } from "../workflows/booking-deposits"
import { acceptPaidQuotesWorkflow } from "../workflows/booking-quotes"
import { sendBookingJobsWorkflow } from "../workflows/send-booking-jobs"
import { placeOrderPassesWorkflow } from "../workflows/booking-passes"

// TASKS P3-07: confirm an order's bookings and link them to it; then record
// the shop's commission on each partner booking (P3-33). The order
// notifications have their own order.placed subscriber (order-placed.ts).
export default async function bookingOrderPlacedHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const { result: confirmed } = await confirmOrderBookingsWorkflow(container).run({ input: { order_id: data.id } })
  await recordProviderCommissionsWorkflow(container).run({ input: { order_id: data.id } })
  // Event tickets with their codes, emailed (P3-24).
  await issueEventTicketsWorkflow(container).run({ input: { order_id: data.id } })
  // The balance after a deposit, to pay at the shop or venue (P3-26).
  await createBookingBalanceWorkflow(container).run({ input: { order_id: data.id } })
  // A booked quote is accepted (P3-27).
  await acceptPaidQuotesWorkflow(container).run({ input: { order_id: data.id } })
  // Passes bought, and credits used by bookings paid with one (P3-29).
  await placeOrderPassesWorkflow(container).run({ input: { order_id: data.id } })
  // The job to whoever's calendar each booking is on, on Telegram (P3-28).
  await sendBookingJobsWorkflow(container).run({
    input: { jobs: confirmed.map((booking_id) => ({ booking_id, kind: "new" as const })) },
  })
}

export const config: SubscriberConfig = { event: "order.placed" }
