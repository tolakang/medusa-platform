// Event packages (TASKS P3-30, kind H): a product whose Metadata
// `package_items` lists its pieces; the customer picks the event date and
// every piece is booked together, or none. Pure parts, unit-tested.
//
// A piece: { sku, day?, time } for a time-slot service (day = days after the
// event date, default 0; time = local "HH:MM"), or { sku, day?, days } for a
// rental by whole days (days >= 1).

export const PACKAGE_ITEM_KEY = "booking_package_id"
export const PACKAGE_DATE_KEY = "booking_event_date"
// How many pieces this package line has in the cart (an à la carte choice).
export const PACKAGE_PIECES_KEY = "booking_package_pieces"
export const PACKAGE_CHOICE_MESSAGE = "Choose the parts you want."
export const PACKAGE_NOT_MESSAGE = "This isn't an event package."
export const PACKAGE_ALONE_MESSAGE = "Book this package with its event date."
export const PACKAGE_INCOMPLETE_MESSAGE = "This package is missing some of its parts. Remove it and book it again."
export const PACKAGE_DATE_MESSAGE = "Choose an event date from tomorrow on, at most a year ahead."

// `sku`, or a `variant_id` (a partner's own services have no SKU).
export type PackagePiece = { sku: string; variant_id?: string; day: number; time?: string; days?: number; label?: string; seats?: number; hours?: number }

const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/

export function packagePieces(meta: Record<string, unknown> | null | undefined): PackagePiece[] | null {
  const raw = meta?.package_items
  if (!Array.isArray(raw) || !raw.length || raw.length > 20) return null
  const pieces: PackagePiece[] = []
  for (const r of raw as Record<string, unknown>[]) {
    const sku = typeof r?.sku === "string" ? r.sku.trim() : ""
    const variantId = typeof r?.variant_id === "string" ? r.variant_id.trim() : ""
    const day = r?.day === undefined ? 0 : Number(r.day)
    if ((!sku && !variantId) || !Number.isInteger(day) || day < 0 || day > 30) return null
    const label = {
      ...(typeof r.label === "string" && r.label.trim() ? { label: r.label.trim().slice(0, 80) } : {}),
      ...(variantId ? { variant_id: variantId } : {}),
    }
    // A departure's seats, or a trip's hours (P3-30 follow-up).
    const seats = Number(r.seats)
    const hours = Number(r.hours)
    const more = {
      ...(Number.isInteger(seats) && seats > 1 && seats <= 50 ? { seats } : {}),
      ...(Number.isInteger(hours) && hours >= 1 && hours <= 24 ? { hours } : {}),
    }
    if (typeof r.time === "string" && hhmm.test(r.time)) {
      pieces.push({ sku, day, time: r.time, ...label, ...more })
    } else if (Number.isInteger(Number(r.days)) && Number(r.days) >= 1 && Number(r.days) <= 30) {
      pieces.push({ sku, day, days: Number(r.days), ...label })
    } else {
      return null
    }
  }
  return pieces
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// Tomorrow (in the shop's zone) up to a year ahead.
export function eventDateOk(date: string, today: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date > today && date <= addDays(today, 365)
}

// A cart's package lines are whole: for each package id, the package line
// and every piece it lists. `pieces` = the number the package's Metadata has.
export function packageComplete(lines: { package_id: string; is_package: boolean }[], pieces: Map<string, number>): boolean {
  const ids = new Set(lines.map((l) => l.package_id))
  for (const id of ids) {
    const mine = lines.filter((l) => l.package_id === id)
    const head = mine.filter((l) => l.is_package).length
    const want = pieces.get(id)
    if (head !== 1 || want === undefined || mine.length - 1 !== want) return false
  }
  return true
}

// À la carte (P3-30): Metadata `package_mode: "a_la_carte"` lets the customer
// choose which pieces (at least `package_min`, default 1); each chosen piece
// costs its own price and the package line is $0. A ready-made package books
// every piece, at the package's price.
export function packageMode(meta: Record<string, unknown> | null | undefined): "fixed" | "a_la_carte" {
  return meta?.package_mode === "a_la_carte" ? "a_la_carte" : "fixed"
}

export function chosenPieces(
  pieces: PackagePiece[],
  meta: Record<string, unknown> | null | undefined,
  choices: number[] | null | undefined
): PackagePiece[] | null {
  if (packageMode(meta) === "fixed") return pieces
  const min = Math.max(Number.isInteger(Number(meta?.package_min)) ? Number(meta!.package_min) : 1, 1)
  const picked = [...new Set(choices ?? [])]
  if (picked.length < min || picked.some((i) => !Number.isInteger(i) || i < 0 || i >= pieces.length)) return null
  return picked.sort((a, b) => a - b).map((i) => pieces[i])
}
