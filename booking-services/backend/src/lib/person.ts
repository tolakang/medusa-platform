// Names and phones shown to staff and in emails (browser test of main).

type Named = { first_name?: string | null; last_name?: string | null } | null | undefined

const full = (p: Named) => [p?.first_name, p?.last_name].filter(Boolean).join(" ")

// The customer's name, else the order's billing or shipping address name
// (a guest order's customer often has no name), as issue-event-tickets does.
export function personName(...people: Named[]): string | null {
  for (const p of people) {
    const name = full(p).trim()
    if (name) return name
  }
  return null
}

// One stored format for walk-in phones, whatever was typed: Cambodian
// numbers (0XX…, 855XX…, +855XX…) become "+855 XX XXX XXX" (or "XXXX" for
// 9-digit numbers); other international numbers become "+<digits>". Run
// after the phone rule (medusa-core lib/phone) has accepted the value.
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
