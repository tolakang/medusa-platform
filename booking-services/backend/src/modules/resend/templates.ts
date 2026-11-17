// This app's email templates for the shared Resend provider (./index.ts): its
// booking reminder and event tickets, then the core's order and account emails (BUILD_PLAN.md §4.2).
import { renderCoreEmail } from "@medusa-platform/medusa-core/lib/resend/emails"
import type { RenderedEmail } from "@medusa-platform/medusa-core/lib/resend/service"
import {
  BOOKING_REMINDER_TEMPLATE,
  bookingReminderEmail,
  type BookingReminderData,
} from "../../lib/booking-reminder"
import { EVENT_TICKETS_TEMPLATE, eventTicketsEmail, type EventTicketsData } from "../../lib/event-tickets"
import { BALANCE_TEMPLATE, balanceReminderEmail, type BalanceReminderData } from "../../lib/deposits"
import { escapeHtml } from "@medusa-platform/medusa-core/lib/order-notification"

export function renderEmail(
  template: string | null | undefined,
  data: Record<string, unknown> | null | undefined
): RenderedEmail | null {
  // 24-hour booking reminder (TASKS P3-09).
  if (template === BOOKING_REMINDER_TEMPLATE && (data as BookingReminderData | null)?.booking) {
    return bookingReminderEmail(data as BookingReminderData)
  }
  // Event tickets with their codes (TASKS P3-24).
  if (template === EVENT_TICKETS_TEMPLATE && (data as EventTicketsData | null)?.tickets?.length) {
    return eventTicketsEmail(data as EventTicketsData)
  }
  // A balance still to pay after a deposit (TASKS P3-26).
  if (template === BALANCE_TEMPLATE && (data as BalanceReminderData | null)?.due_at) {
    return balanceReminderEmail(data as BalanceReminderData, escapeHtml)
  }
  return renderCoreEmail(template, data)
}
