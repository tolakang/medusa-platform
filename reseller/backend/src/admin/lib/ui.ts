// Shared helpers for the reseller admin pages (design-system review,
// 2026-11-24): one error sentence, one money format, status words.

export const errorText = (e: unknown) =>
  (e as { message?: string })?.message || "Something went wrong. Try again."

export const money = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency.toUpperCase()}`
  }
}

export const SELLER_STATUS_LABEL: Record<string, string> = {
  pending: "Invited",
  active: "Active",
  suspended: "Suspended",
}
