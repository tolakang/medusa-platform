// Shared formatting for the booking admin pages (design-system review,
// 2026-11-24): one way to show an error, money, a date and a status.

// Medusa's validation errors start with "Invalid request: "; staff only need
// the reason.
export const errorText = (e: unknown) =>
  ((e as { message?: string })?.message ?? "").replace(/^Invalid request:\s*/i, "") || "Something went wrong. Try again."

export function formatMoney(amount: number | string | null | undefined, currency: string | null | undefined): string {
  if (amount === null || amount === undefined || amount === "" || !currency) return "–"
  const n = Number(amount)
  if (!Number.isFinite(n)) return "–"
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(n)
  } catch {
    return `${n.toFixed(2)} ${currency.toUpperCase()}`
  }
}

// The line after a staff cancel: "Cancelled. $8.00 refunded." when money went
// back, else the refund outcome in plain words ("not captured" read as jargon).
const REFUND_WORDS: Record<string, string> = {
  not_captured: "Nothing was paid, so nothing to refund.",
  outside_policy: "No refund (too close to the start).",
  refunded: "Refunded.",
}
export function cancelText(data: { refund: string; refunded_amount?: number | null }, currency?: string | null): string {
  if (data.refunded_amount && currency) return `Cancelled. ${formatMoney(data.refunded_amount, currency)} refunded.`
  if (data.refunded_amount) return `Cancelled. ${data.refunded_amount} refunded.`
  return `Cancelled. ${REFUND_WORDS[data.refund] ?? `Refund: ${data.refund.replace(/_/g, " ")}.`}`
}

// "24 Nov 2026" and "24 Nov 2026, 14:30", the same on every browser locale.
export const formatDate = (d: string | Date, timeZone?: string) =>
  new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone })
export const formatDateTime = (d: string | Date, timeZone?: string) =>
  new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone })

// Status codes in staff words.
export const STATUS_LABEL: Record<string, string> = {
  pending: "Held",
  confirmed: "Booked",
  completed: "Done",
  cancelled: "Cancelled",
  expired: "Expired",
  no_show: "No-show",
  requested: "Requested",
  quoted: "Quote sent",
  accepted: "Accepted",
  declined: "Declined",
  approved: "Approved",
  paid: "Paid",
  held: "Held for review",
}
export const statusLabel = (s: string) => STATUS_LABEL[s] ?? s.replace(/_/g, " ")
