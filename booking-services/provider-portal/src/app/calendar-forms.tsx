"use client"

import { useActionState } from "react"
import { Notice } from "@/components/notice"
import { bookWalkIn, cancelBooking, type FormState } from "./actions"

export function WalkInForm({ resourceId, date }: { resourceId: string; date: string }) {
  const [state, action, working] = useActionState<FormState, FormData>(bookWalkIn, {})
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="resource_id" value={resourceId} />
      <input type="hidden" name="date" value={date} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Start</span>
          <input className="field" name="time" type="time" defaultValue="09:00" required />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Minutes</span>
          <input className="field w-24" name="minutes" type="number" min={5} max={720} step={5} defaultValue={30} required />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-sm font-medium">Notes (optional)</span>
          <input className="field" name="notes" maxLength={500} />
        </label>
        <button className="btn-primary" type="submit" disabled={working}>
          {working ? "Booking…" : "Book walk-in"}
        </button>
      </div>
      <Notice state={state} />
    </form>
  )
}

export function CancelButton({ bookingId }: { bookingId: string }) {
  const [state, action, working] = useActionState<FormState, FormData>(cancelBooking, {})
  return (
    <form
      action={action}
      className="flex flex-col items-end gap-1"
      onSubmit={(e) => {
        if (!window.confirm("Cancel this booking? The customer is told, and refunded if the shop's rules allow.")) {
          e.preventDefault()
        }
      }}
    >
      <input type="hidden" name="booking_id" value={bookingId} />
      <button className="btn-secondary" type="submit" disabled={working}>
        {working ? "Cancelling…" : "Cancel"}
      </button>
      {state.error && (
        <span role="alert" className="text-xs text-ui-tag-red-text">
          {state.error}
        </span>
      )}
    </form>
  )
}
