"use client"

import { useActionState, useState } from "react"
import { fulfil, type FulfilState } from "./actions"

// Mark fulfilled can't be taken back, so it asks once more in the page
// (design critique, 2026-11-23), then says it's done.
export function FulfilButton({ orderId }: { orderId: string }) {
  const [state, action, working] = useActionState<FulfilState, FormData>(fulfil, {})
  const [sure, setSure] = useState(false)
  if (state.done) {
    return (
      <p role="status" className="text-sm text-ui-tag-green-text">
        ✓ Marked fulfilled
      </p>
    )
  }
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="order_id" value={orderId} />
      {sure ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="w-full text-right text-sm">Every item is packed and sent?</span>
          <input className="field w-44" name="tracking_number" placeholder="Tracking number (optional)" aria-label="Tracking number (optional)" maxLength={100} />
          <input className="field w-56" name="tracking_url" type="url" placeholder="Tracking link (optional)" aria-label="Tracking link (optional)" maxLength={500} />
          <button className="btn-secondary" type="button" onClick={() => setSure(false)} disabled={working}>
            Not yet
          </button>
          <button className="btn-primary" type="submit" disabled={working}>
            {working ? "Saving…" : "Yes, mark fulfilled"}
          </button>
        </div>
      ) : (
        <button className="btn-primary" type="button" onClick={() => setSure(true)}>
          Mark fulfilled
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
