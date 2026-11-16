import Link from "next/link"
import { Shell } from "@/components/shell"
import { customerLabel, STATUS_LABEL } from "@/lib/format"
import { providerGet, requireProvider } from "@/lib/server/provider"
import { addDays, dayLabel, dayWindow, isDate, timeRange, todayIn } from "@/lib/time"
import { CancelButton, WalkInForm } from "./calendar-forms"

type Booking = {
  id: string
  status: string
  starts_at: string
  ends_at: string
  notes: string | null
  customer: { email: string | null; first_name: string | null; last_name: string | null } | null
  order: { id: string; display_id: number | null } | null
}

// TASKS P3-32: the provider's calendar, one day at a time, in the calendar's
// own time zone: the bookings, a walk-in form and cancel.
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; calendar?: string }>
}) {
  const { token, provider } = await requireProvider()
  if (provider.status !== "active") {
    return <Shell provider={provider} active="/">{null}</Shell>
  }
  const params = await searchParams
  const calendar = provider.resources.find((r) => r.id === params.calendar) ?? provider.resources[0]
  if (!calendar) {
    return (
      <Shell provider={provider} active="/">
        <p className="card px-4 py-3 text-sm">You have no calendar yet. Ask the shop to add one for you.</p>
      </Shell>
    )
  }
  const today = todayIn(calendar.timezone)
  const date = isDate(params.date) ? params.date : today
  const { bookings } = await providerGet<{ bookings: Booking[] }>(token, "/providers/me/bookings", {
    resource_id: calendar.id,
    ...dayWindow(date, calendar.timezone),
  })
  const link = (d: string, c = calendar.id) => `/?date=${d}&calendar=${c}`

  return (
    <Shell provider={provider} active="/">
      {provider.resources.length > 1 && (
        <nav className="flex flex-wrap gap-2" aria-label="Calendars">
          {provider.resources.map((r) => (
            <Link key={r.id} href={link(date, r.id)} className={r.id === calendar.id ? "btn-primary" : "btn-secondary"}>
              {r.name}
            </Link>
          ))}
        </nav>
      )}
      <section className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">{dayLabel(date)}</h2>
            <p className="text-sm text-ui-fg-subtle">
              {calendar.name} · times in {calendar.timezone}
            </p>
          </div>
          <div className="flex gap-2">
            <Link className="btn-secondary" href={link(addDays(date, -1))}>
              Previous
            </Link>
            <Link className="btn-secondary" href={link(today)}>
              Today
            </Link>
            <Link className="btn-secondary" href={link(addDays(date, 1))}>
              Next
            </Link>
          </div>
        </div>
        {bookings.length ? (
          <ul className="mt-4 flex flex-col gap-2">
            {bookings.map((b) => {
              const gone = b.status === "cancelled" || b.status === "expired"
              return (
                <li
                  key={b.id}
                  className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ui-border-base px-3 py-2 ${gone ? "opacity-60" : ""}`}
                >
                  <div>
                    <p className="font-medium">
                      {timeRange(b, calendar.timezone)} · {customerLabel(b)}
                    </p>
                    <p className="text-sm text-ui-fg-subtle">
                      {STATUS_LABEL[b.status] ?? b.status}
                      {b.order?.display_id ? ` · Order #${b.order.display_id}` : ""}
                      {b.notes ? ` · ${b.notes}` : ""}
                    </p>
                  </div>
                  {(b.status === "confirmed" || b.status === "pending") && <CancelButton bookingId={b.id} />}
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-ui-fg-subtle">No bookings this day.</p>
        )}
      </section>
      <section className="card p-4">
        <h2 className="mb-1 font-semibold">Walk-in booking</h2>
        <p className="mb-3 text-sm text-ui-fg-subtle">
          Books {calendar.name} on {dayLabel(date)}: confirmed straight away, within the opening hours.
        </p>
        <WalkInForm resourceId={calendar.id} date={date} />
      </section>
    </Shell>
  )
}
