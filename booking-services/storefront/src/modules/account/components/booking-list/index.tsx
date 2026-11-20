"use client"

import { cancelMyBooking, cancelMyPackage, cancelMySeries, listSlots, moveMyBooking, writeReview, type MyBooking, type Slot } from "@lib/data/booking"
import { formatBookingRange } from "@lib/util/booking"
import { Badge, Button, Heading, Text, clx } from "@modules/common/components/ui"
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
  // The booking's local day in its calendar's zone (review finding: the UTC
  // day could be the day before).
  const [date, setDate] = useState(() =>
    new Intl.DateTimeFormat("en-CA", { timeZone: booking.resource?.timezone ?? undefined, year: "numeric", month: "2-digit", day: "2-digit" }).format(
      new Date(booking.starts_at)
    )
  )
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

// Review a booking you had (TASKS P3-29): stars and an optional comment.
function WriteReview({ booking, onDone }: { booking: MyBooking; onDone: (notice: string) => void }) {
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <div className="flex w-full flex-col gap-y-2" data-testid="booking-review-form">
      <div className="flex gap-x-1" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            className={clx("text-2xl leading-none", n <= rating ? "text-ui-fg-base" : "text-ui-fg-muted")}
            onClick={() => setRating(n)}
          >
            {n <= rating ? "★" : "☆"}
          </button>
        ))}
      </div>
      <textarea
        className="w-full rounded-md border border-ui-border-base px-3 py-2 txt-small"
        rows={3}
        maxLength={1000}
        placeholder="How was it? (optional)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <Button
        className="self-start"
        disabled={!rating}
        isLoading={pending}
        data-testid="booking-review-submit"
        onClick={() =>
          start(async () => {
            const r = await writeReview(booking.id, rating, comment)
            if (r.error) setError(r.error)
            else onDone("Thank you for your review.")
          })
        }
      >
        Post review
      </Button>
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
  const [reviewing, setReviewing] = useState<string | null>(null)

  // A piece of an event package cancels the whole package (P3-30).
  const cancel = (id: string) => {
    const packageId = bookings.find((b) => b.id === id)?.package_id
    setConfirming(null)
    setBusy(id)
    start(async () => {
      const result = packageId ? await cancelMyPackage(packageId) : await cancelMyBooking(id)
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
              {b.series_id ? " · Weekly" : ""}
              {b.package_id ? " · Event package" : ""}
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
            {!canCancel && b.product_id && !b.reviewed && reviewing !== b.id &&
              (b.status === "confirmed" || b.status === "completed") && (
                <Button variant="secondary" onClick={() => setReviewing(b.id)} data-testid="booking-review">
                  Write a review
                </Button>
              )}
            {!canCancel && b.reviewed && <Text className="txt-small text-ui-fg-subtle">Reviewed</Text>}
            {/* Cancel the rest of a series, after a "Yes" like every other
                cancel (review finding: it fired on one click). */}
            {canCancel && b.series_id && b.status === "confirmed" && confirming !== b.id && confirming !== `series:${b.id}` && (
              <Button variant="secondary" data-testid="booking-cancel-series" onClick={() => setConfirming(`series:${b.id}`)}>
                Cancel the rest
              </Button>
            )}
            {canCancel && b.series_id && confirming === `series:${b.id}` && (
              <>
                <Button variant="secondary" onClick={() => setConfirming(null)}>
                  Keep them
                </Button>
                <Button
                  isLoading={pending && busy === `series:${b.series_id}`}
                  data-testid="booking-cancel-series-confirm"
                  onClick={() => {
                    setConfirming(null)
                    setBusy(`series:${b.series_id}`)
                    start(async () => {
                      const r = await cancelMySeries(b.series_id!)
                      setNotice(r.error ?? `Cancelled ${r.cancelled} visits of the series.`)
                      setBusy(null)
                      router.refresh()
                    })
                  }}
                >
                  Yes, cancel every visit not yet started
                </Button>
              </>
            )}
            {canCancel && confirming !== b.id && confirming !== `series:${b.id}` && (
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
                  {b.package_id ? "Yes, cancel the whole package" : "Yes, cancel"}
                </Button>
              </>
            )}
          </div>
          {reviewing === b.id && (
            <WriteReview
              booking={b}
              onDone={(text) => {
                setReviewing(null)
                setNotice(text)
                router.refresh()
              }}
            />
          )}
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
