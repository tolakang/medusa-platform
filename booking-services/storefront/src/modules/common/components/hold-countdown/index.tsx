"use client"

import { listCartHolds } from "@lib/data/booking"
import { holdLeft } from "@lib/util/booking"
import { useEffect, useState } from "react"

// How long a booking line's time stays held (booking.hold_expires_at, from
// GET /store/booking/cart). Lines mounted together share one request; a
// later mount (another page, a new booking) asks again.
let holds: { at: number; request: Promise<Record<string, string>> } | null = null
const loadHolds = () => {
  if (!holds || Date.now() - holds.at > 5000) {
    holds = { at: Date.now(), request: listCartHolds() }
  }
  return holds.request
}

export default function HoldCountdown({ bookingId }: { bookingId?: string | null }) {
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!bookingId) return
    let active = true
    loadHolds().then((byId) => active && setExpiresAt(byId[bookingId] ?? null))
    return () => {
      active = false
    }
  }, [bookingId])

  useEffect(() => {
    if (!expiresAt) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [expiresAt])

  if (!expiresAt) return null
  const left = holdLeft(expiresAt, now)
  return (
    <span className="block txt-small text-ui-fg-subtle" data-testid="booking-hold-countdown" aria-live="off">
      {left ? `Held for you for ${left}` : "Hold ran out: book again to keep this time"}
    </span>
  )
}
