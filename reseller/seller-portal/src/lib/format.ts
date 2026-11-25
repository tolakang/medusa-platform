// TASKS P5-08: display helpers (pure, tested in __tests__/format.test.ts).

export function money(amount: number | string | null | undefined, currency: string): string {
  const value = Number(amount ?? 0)
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(value)
  } catch {
    return `${value.toFixed(2)} ${currency.toUpperCase()}`
  }
}

export function day(value: string | Date | null | undefined): string {
  if (!value) {
    return ""
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10)
}

/** 1-based page from a query value; anything else is page 1. */
export function pageFrom(raw: string | string[] | undefined): number {
  const n = Number(Array.isArray(raw) ? raw[0] : raw)
  return Number.isInteger(n) && n >= 1 ? n : 1
}

/** Which IDs to add and remove, from the current selection and the form's. */
export function selectionChange(current: string[], wanted: string[]) {
  const now = new Set(current)
  const next = new Set(wanted)
  return {
    add: [...next].filter((id) => !now.has(id)),
    remove: [...now].filter((id) => !next.has(id)),
  }
}

export const COMMISSION_STATUSES = ["pending", "approved", "paid", "cancelled"] as const
export type CommissionStatus = (typeof COMMISSION_STATUSES)[number]

export function commissionStatus(raw: string | string[] | undefined): CommissionStatus | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw
  return COMMISSION_STATUSES.find((s) => s === value)
}

const COMMISSION_LABELS: Record<string, string> = {
  pending: "Waiting",
  approved: "Due",
  paid: "Paid",
  cancelled: "Cancelled",
}

const ORDER_LABELS: Record<string, string> = {
  pending: "Placed",
  completed: "Completed",
  canceled: "Cancelled",
  archived: "Archived",
  requires_action: "Needs action",
  draft: "Draft",
}

/** A plain-words label for a Medusa order status (design critique 2026-11-23). */
export function orderStatusLabel(status: string): string {
  return ORDER_LABELS[status] ?? status.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
}

/** A plain-words label for a commission status. */
export function commissionLabel(status: string): string {
  return COMMISSION_LABELS[status] ?? orderStatusLabel(status)
}
