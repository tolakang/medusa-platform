import { Shell } from "@/components/shell"
import { hoursText, type Hours } from "@/lib/format"
import { providerGet, requirePartner } from "@/lib/server/provider"
import { dayLabel, todayIn } from "@/lib/time"
import { DayOffForm, HoursForm, RemoveDayOff } from "./forms"

type Calendar = { id: string; name: string; timezone: string; schedules: Hours[]; days_off: { date: string }[] }

// TASKS P3-32: a partner's weekly hours and days off, per calendar.
export default async function HoursPage() {
  const { token, provider } = await requirePartner()
  if (provider.status !== "active") {
    return <Shell provider={provider} active="/hours">{null}</Shell>
  }
  const { resources } = await providerGet<{ resources: Calendar[] }>(token, "/providers/me/resources")
  return (
    <Shell provider={provider} active="/hours">
      {resources.map((c) => {
        const today = todayIn(c.timezone)
        const upcoming = (c.days_off ?? []).map((d) => d.date).filter((d) => d >= today).sort()
        return (
          <div key={c.id} className="flex flex-col gap-4">
            <section className="card p-4">
              <h2 className="font-semibold">{c.name}: weekly hours</h2>
              <p className="mb-3 text-sm text-ui-fg-subtle">Times in {c.timezone}. Customers can book inside these hours.</p>
              <HoursForm
                resourceId={c.id}
                texts={Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, hoursText(c.schedules ?? [], d)]))}
              />
            </section>
            <section className="card p-4">
              <h2 className="mb-3 font-semibold">{c.name}: days off</h2>
              {upcoming.length ? (
                <ul className="mb-4 flex flex-col gap-2">
                  {upcoming.map((d) => (
                    <li key={d} className="flex items-center justify-between gap-3">
                      <span>{dayLabel(d)}</span>
                      <RemoveDayOff resourceId={c.id} date={d} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-4 text-sm text-ui-fg-subtle">No days off coming up.</p>
              )}
              <DayOffForm resourceId={c.id} />
            </section>
          </div>
        )
      })}
    </Shell>
  )
}
