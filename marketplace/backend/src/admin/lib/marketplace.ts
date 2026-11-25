// Small helpers for the marketplace admin pages (TASKS P6-07).

export const errorText = (e: unknown) =>
  (e as { message?: string })?.message || "Something went wrong. Try again."

/** "$12.50", "KHR 40,000": the currency's own decimals (amounts are in its
 * main unit, as Medusa stores them). Design-system review 2026-11-24. */
export const money = (amount: unknown, currency?: string) => {
  const n = Number(amount ?? 0)
  const code = (currency ?? "").toUpperCase()
  if (!code) return Number.isFinite(n) ? n.toFixed(2) : "–"
  try {
    // Riel without decimals (owner 2026-11-25), as the backend rounds it.
    const digits = code === "KHR" ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {}
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code, ...digits }).format(n)
  } catch {
    return `${n.toFixed(2)} ${code}`
  }
}

/** Status codes in staff words. */
export const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  published: "Published",
  paid: "Paid",
  pending: "Waiting",
  proposed: "Waiting for review",
  draft: "Draft",
  approved: "In a payout",
  suspended: "Suspended",
  rejected: "Rejected",
  cancelled: "Cancelled",
  canceled: "Cancelled",
  completed: "Completed",
  requires_action: "Needs action",
  archived: "Archived",
}
export const statusLabel = (s: string) => STATUS_LABEL[s] ?? s.replace(/_/g, " ")

/** The admin's own page for a record (the dashboard is served under /app). */
export const adminLink = (path: string) => `/app${path}`

export const STATUS_COLOR: Record<string, "green" | "orange" | "red" | "grey" | "blue"> = {
  active: "green",
  published: "green",
  paid: "green",
  pending: "orange",
  proposed: "orange",
  draft: "grey",
  approved: "blue",
  suspended: "red",
  rejected: "red",
  cancelled: "red",
  canceled: "red",
}
