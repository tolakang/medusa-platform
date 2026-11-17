"use client"

import { cancelMyBooking, listSlots, moveMyBooking, type MyBooking, type Slot } from "@lib/data/booking"
import { formatBookingRange } from "@lib/util/booking"
import { Badge, Button, Heading, Text } from "@modules/common/components/ui"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

const REFUND_TEXT: Record<string, string> = {
  refunded: "Cancelled and refunded.",
  outside_policy: "Cancelled. It was too close to the start for a refund.",
  not_captured: "Cancelled. Your payment wasn't taken yet, so nothing is charged.",
  no_order: "Cancelled.",
}

// Change the time (TASKS P3-28): pick a day, then a free time of the same
// length (any calendar offering the service). The shop's cancellation
// cutoff applies; the backend says when it's too late.
function ChangeTime({ booking, onDone }: { booking: MyBooking; onDone: (notice: string) => void }) {
  const minutes = Math.round((Date.parse(booking.ends_at) - Date.parse(booking.starts_at)) / 60_000)
  const [date, setDate] = useState(booking.starts_at.slice(0, 10))
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const load = (d: string) =>
    start(async () => {
      const r = await listSlots(booking.variant_id!, d, minutes)
      setError(r.error ?? null)
      setSlots(r.slots.filter((s) => Date.parse(s.ends_at) - Date.parse(s.starts_at) === minutes * 60_000))
    })
  const move = (slot: Slot) =>
    start(async () => {
      const r = await moveMyBooking(booking.id, slot)
      if (r.error) setError(r.error)
      else onDone("Moved to the new time.")
    })
  return (
    <div className="flex w-full flex-col gap-y-2" data-testid="booking-change-time">
      <div className="flex items-center gap-2">
        <input
          type="date"
          className="rounded-md border border-ui-border-base px-3 py-1 txt-small"
          value={date}
          onChange={(e) => {
            setDate(e.target.value)
            load(e.target.value)
          }}
        />
        <Button variant="secondary" isLoading={pending && !slots} onClick={() => load(date)}>
          Show times
        </Button>
      </div>
      {slots && slots.length === 0 && <Text className="txt-small text-ui-fg-subtle">No free times that day.</Text>}
      {slots && slots.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {slots.map((s) => (
            <Button key={`${s.resource_id}${s.starts_at}`} variant="secondary" disabled={pending} onClick={() => move(s)} data-testid="booking-new-time">
              {formatBookingRange(s.starts_at, s.ends_at, s.timezone ?? booking.resource?.timezone)}
              {s.resource_name && s.resource_name !== booking.resource?.name ? ` · ${s.resource_name}` : ""}
            </Button>
          ))}
        </div>
      )}
      {error && <Text className="txt-small text-ui-fg-error">{error}</Text>}
    </div>
  )
}

// A list of the customer's bookings (TASKS P3-13).
export default function BookingList({
  title,
  bookings,
  empty,
  canCancel = false,
}: {
  title: string
  bookings: MyBooking[]
  empty: string
  canCancel?: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // Two-step cancel in the page (no browser dialog): Cancel → Yes, cancel.
  const [confirming, setConfirming] = useState<string | null>(null)
  const [changing, setChanging] = useState<string | null>(null)

  const cancel = (id: string) => {
    setConfirming(null)
    setBusy(id)
    start(async () => {
      const result = await cancelMyBooking(id)
      setNotice(result.error ?? REFUND_TEXT[result.refund ?? ""] ?? "Cancelled.")
      setBusy(null)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-y-3" data-testid={`bookings-${title.toLowerCase().split(" ")[0]}`}>
      <Heading level="h2" className="text-large-semi">
        {title}
      </Heading>
      {notice && (
        <Text className="txt-small text-ui-fg-subtle" data-testid="booking-notice">
          {notice}
        </Text>
      )}
      {bookings.length === 0 && empty && <Text className="txt-small text-ui-fg-subtle">{empty}</Text>}
      {bookings.map((b) => (
        <div
          key={b.id}
          className="flex flex-wrap items-center justify-between gap-3 border border-ui-border-base rounded-md p-4"
          data-testid="booking-row"
        >
          <div className="flex flex-col gap-y-1">
            <Text className="txt-medium-plus">{formatBookingRange(b.starts_at, b.ends_at, b.resource?.timezone)}</Text>
            <Text className="txt-small text-ui-fg-subtle">
              {b.resource?.name ?? ""}
              {b.order?.display_id != null ? ` · Order #${b.order.display_id}` : ""}
            </Text>
            {b.address && (
              <Text className="txt-small text-ui-fg-subtle" data-testid="booking-address">
                {b.dropoff_address ? `From: ${b.address} · To: ${b.dropoff_address}` : `At: ${b.address}`}
              </Text>
            )}
          </div>
          <div className="flex items-center gap-3">
            <Badge>{b.status === "pending" ? "held" : b.status.replace("_", " ")}</Badge>
            {canCancel && b.status === "confirmed" && b.variant_id && confirming !== b.id && changing !== b.id &&
              Date.parse(b.ends_at) - Date.parse(b.starts_at) < 24 * 3600_000 && (
                <Button variant="secondary" onClick={() => setChanging(b.id)} data-testid="booking-change">
                  Change time
                </Button>
              )}
            {canCancel && confirming !== b.id && (
              <Button
                variant="secondary"
                isLoading={pending && busy === b.id}
                onClick={() => setConfirming(b.id)}
                data-testid="booking-cancel"
              >
                Cancel
              </Button>
            )}
            {canCancel && confirming === b.id && (
              <>
                <Button variant="secondary" onClick={() => setConfirming(null)} data-testid="booking-keep">
                  Keep it
                </Button>
                <Button onClick={() => cancel(b.id)} data-testid="booking-cancel-confirm">
                  Yes, cancel
                </Button>
              </>
            )}
          </div>
          {changing === b.id && (
            <ChangeTime
              booking={b}
              onDone={(text) => {
                setChanging(null)
                setNotice(text)
                router.refresh()
              }}
            />
          )}
        </div>
      ))}
    </div>
  )
}
