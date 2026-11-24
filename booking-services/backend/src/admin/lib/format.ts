// Shared formatting for the booking admin pages (design-system review,
// 2026-11-24): one way to show an error, money, a date and a status.

export const errorText = (e: unknown) => (e as { message?: string })?.message || "Something went wrong. Try again."

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
