// Phone numbers entered by shoppers (checkout and account addresses). Medusa
// 2.21.1 accepts any string (`phone: z.string().nullish()` in the store
// validators), so letters were saved. Allowed: an optional leading +, then
// digits with spaces, hyphens or parentheses, 8 to 15 digits in total
// (E.164 allows at most 15; Cambodian numbers are 9–10 digits with the 0,
// e.g. 012 345 678 or +855 12 345 678). Empty means no phone (optional).
// Keep in step with the storefront's src/lib/util/phone.ts.

export const PHONE_MESSAGE =
  "Enter a phone number with digits only, for example 012 345 678 or +855 12 345 678."

export function isValidPhone(value: unknown): boolean {
  if (value === null || value === undefined || value === "") {
    return true
  }
  if (typeof value !== "string" || !/^\+?[0-9 ()-]+$/.test(value.trim())) {
    return false
  }
  const digits = value.replace(/\D/g, "").length
  return digits >= 8 && digits <= 15
}

// One stored format for phones, whatever was typed: Cambodian numbers
// (0XX…, 855XX…, +855XX…) become "+855 XX XXX XXX" (or "XXXX" for 9-digit
// numbers); other international numbers become "+<digits>". Run after
// isValidPhone has accepted the value. Same rule as booking's walk-in
// phones (booking-services/backend src/lib/person.ts, PR #120).
export function normalizePhone(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim()
  if (!trimmed) return null
  const digits = trimmed.replace(/\D/g, "")
  let national: string | null = null
  if (digits.startsWith("855") && (trimmed.startsWith("+") || digits.length >= 11)) {
    national = digits.slice(3)
  } else if (!trimmed.startsWith("+") && digits.startsWith("0")) {
    national = digits.slice(1)
  }
  if (national !== null && (national.length === 8 || national.length === 9)) {
    return `+855 ${national.slice(0, 2)} ${national.slice(2, 5)} ${national.slice(5)}`
  }
  return trimmed.startsWith("+") ? `+${digits}` : digits
}
