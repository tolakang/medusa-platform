"use client"

import { useActionState, useState } from "react"
import { Notice } from "@/components/notice"
import { isValidPhone, PHONE_MESSAGE } from "@/lib/format"
import { bookWalkIn, cancelBooking, moveBooking, type FormState } from "./actions"

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
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Name (optional)</span>
          <input className="field" name="walk_in_name" maxLength={120} autoComplete="off" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Phone (optional)</span>
          <input
            className="field w-40"
            name="walk_in_phone"
            type="tel"
            inputMode="tel"
            placeholder="012 345 678"
            title={PHONE_MESSAGE}
            onInput={(e) => e.currentTarget.setCustomValidity(isValidPhone(e.currentTarget.value.trim()) ? "" : PHONE_MESSAGE)}
          />
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
  // A second step in the page instead of a browser dialog (design critique).
  const [sure, setSure] = useState(false)
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="booking_id" value={bookingId} />
      {sure ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="text-sm">Cancel it? The customer is told and gets a full refund.</span>
          <button className="btn-secondary" type="button" onClick={() => setSure(false)} disabled={working}>
            Keep it
          </button>
          <button className="btn-primary" type="submit" disabled={working}>
            {working ? "Cancelling…" : "Yes, cancel"}
          </button>
        </div>
      ) : (
        <button className="btn-secondary" type="button" onClick={() => setSure(true)}>
          Cancel
        </button>
      )}
      {state.error && (
        <span role="alert" className="text-xs text-ui-tag-red-text">
          {state.error}
        </span>
      )}
    </form>
  )
}

// Move a booking to another day and time (gap review 2026-11-24).
export function MoveButton({ bookingId, date, timezone }: { bookingId: string; date: string; timezone: string }) {
  const [state, action, working] = useActionState<FormState, FormData>(moveBooking, {})
  const [open, setOpen] = useState(false)
  if (!open) {
    return (
      <button className="btn-secondary" type="button" onClick={() => setOpen(true)}>
        Move
      </button>
    )
  }
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="booking_id" value={bookingId} />
      <input type="hidden" name="timezone" value={timezone} />
      <label className="flex flex-col gap-1 text-sm">
        New day
        <input className="field" type="date" name="date" defaultValue={date} required />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Start
        <input className="field" type="time" name="time" required />
      </label>
      <button className="btn-primary" type="submit" disabled={working}>
        {working ? "Moving…" : "Move booking"}
      </button>
      <button className="btn-secondary" type="button" onClick={() => setOpen(false)} disabled={working}>
        Close
      </button>
      <Notice state={state} />
    </form>
  )
}
