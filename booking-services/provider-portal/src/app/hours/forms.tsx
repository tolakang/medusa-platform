"use client"

import { useActionState } from "react"
import { Notice } from "@/components/notice"
import { WEEK_ORDER, WEEKDAYS } from "@/lib/format"
import { addDayOff, removeDayOff, saveHours, type FormState } from "./actions"

export function HoursForm({ resourceId, texts }: { resourceId: string; texts: Record<number, string> }) {
  const [state, action, saving] = useActionState<FormState, FormData>(saveHours, {})
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="resource_id" value={resourceId} />
      {WEEK_ORDER.map((d) => (
        <label key={d} className="flex flex-wrap items-center gap-3">
          <span className="w-28 text-sm font-medium">{WEEKDAYS[d]}</span>
          <input
            className="field flex-1"
            name={`day_${d}`}
            defaultValue={texts[d] ?? ""}
            placeholder="Closed"
            aria-label={`${WEEKDAYS[d]} hours`}
          />
        </label>
      ))}
      <p className="text-sm text-ui-fg-subtle">Like 09:00-12:00, 13:00-17:00. Leave empty when closed.</p>
      <Notice state={state} />
      <button className="btn-primary self-start" type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save hours"}
      </button>
    </form>
  )
}

export function DayOffForm({ resourceId }: { resourceId: string }) {
  const [state, action, saving] = useActionState<FormState, FormData>(addDayOff, {})
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="resource_id" value={resourceId} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Day</span>
          <input className="field" name="date" type="date" required />
        </label>
        <button className="btn-primary" type="submit" disabled={saving}>
          {saving ? "Adding…" : "Add day off"}
        </button>
      </div>
      <Notice state={state} />
    </form>
  )
}

export function RemoveDayOff({ resourceId, date }: { resourceId: string; date: string }) {
  const [state, action, working] = useActionState<FormState, FormData>(removeDayOff, {})
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="resource_id" value={resourceId} />
      <input type="hidden" name="date" value={date} />
      <button className="btn-secondary" type="submit" disabled={working}>
        Remove
      </button>
      {state.error && <span className="text-xs text-ui-tag-red-text">{state.error}</span>}
    </form>
  )
}
