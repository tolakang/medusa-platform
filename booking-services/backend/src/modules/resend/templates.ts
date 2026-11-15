// This app's email templates for the shared Resend provider (./index.ts): its
// booking reminder, then the core's order and account emails (BUILD_PLAN.md §4.2).
import { renderCoreEmail } from "@medusa-platform/medusa-core/lib/resend/emails"
import type { RenderedEmail } from "@medusa-platform/medusa-core/lib/resend/service"
import {
  BOOKING_REMINDER_TEMPLATE,
  bookingReminderEmail,
  type BookingReminderData,
} from "../../lib/booking-reminder"

export function renderEmail(
  template: string | null | undefined,
  data: Record<string, unknown> | null | undefined
): RenderedEmail | null {
  // 24-hour booking reminder (TASKS P3-09).
  if (template === BOOKING_REMINDER_TEMPLATE && (data as BookingReminderData | null)?.booking) {
    return bookingReminderEmail(data as BookingReminderData)
  }
  return renderCoreEmail(template, data)
}
