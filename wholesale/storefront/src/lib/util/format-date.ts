// One date format for every account page (polish 2026-11-25): "25 Nov 2026",
// and "25 Nov 2026, 14:05 UTC" where the time matters (quote messages,
// payments). UTC so the server render and the browser agree.

type DateInput = string | Date | null | undefined

const toDate = (value: DateInput) => {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export const formatDate = (value: DateInput, fallback = "-") => {
  const date = toDate(value)
  return date
    ? date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : fallback
}

export const formatDateTime = (value: DateInput, fallback = "-") => {
  const date = toDate(value)
  return date
    ? date.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
      }) + " UTC"
    : fallback
}
