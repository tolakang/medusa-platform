// The job a person, driver or keeper gets on Telegram (TASKS P3-28): a new
// booking on their calendar, a booking moved to or on it, or one taken off
// it. Pure, so it's unit-tested on its own.

export type JobKind = "new" | "moved" | "removed"

export type JobData = {
  kind: JobKind
  calendar: string
  timezone: string
  starts_at: string
  ends_at: string
  service?: string | null
  customer?: string | null
  phone?: string | null
  address?: string | null
  dropoff_address?: string | null
  seats?: number | null
  notes?: string | null
  order?: number | null
  // Where it was before a move.
  previous?: { calendar: string; starts_at: string } | null
}

const when = (iso: string, timeZone: string, withDay = true) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone,
    ...(withDay ? { weekday: "short", day: "numeric", month: "short" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso))

const TITLE: Record<JobKind, string> = { new: "🗓 New job", moved: "🔁 Job moved", removed: "➖ Job taken off your calendar" }

export function jobMessage(job: JobData): string {
  const lines = [
    `${TITLE[job.kind]}${job.service ? `: ${job.service}` : ""}`,
    `${when(job.starts_at, job.timezone)}–${when(job.ends_at, job.timezone, false)} · ${job.calendar}`,
  ]
  if (job.previous) {
    lines.push(`Was: ${when(job.previous.starts_at, job.timezone)} · ${job.previous.calendar}`)
  }
  if (job.kind !== "removed") {
    if (job.customer || job.phone) lines.push(`Customer: ${[job.customer, job.phone].filter(Boolean).join(", ")}`)
    if (job.address && job.dropoff_address) lines.push(`From: ${job.address}\nTo: ${job.dropoff_address}`)
    else if (job.address) lines.push(`At: ${job.address}`)
    if ((job.seats ?? 1) > 1) lines.push(`Seats: ${job.seats}`)
    if (job.notes) lines.push(`Notes: ${job.notes}`)
  }
  if (job.order != null) lines.push(`Order #${job.order}`)
  return lines.join("\n")
}
