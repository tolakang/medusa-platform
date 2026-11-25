"use client"

import {
  addBookingToCart,
  addRecurringToCart,
  listSlots,
  listTripZones,
  type MyPass,
  type Slot,
  type TripZones,
} from "@lib/data/booking"
import {
  durationMinutes,
  formatSlotTime,
  depositPercent,
  isDepartureService,
  isVisitService,
  localDate,
  MAX_TRIP_HOURS,
  maxSeats,
  minHours,
  orderedServices,
  serviceChoiceLabel,
  tripPricing,
  zonePrice,
} from "@lib/util/booking"
import { convertToLocale } from "@lib/util/money"
import { HttpTypes } from "@medusajs/types"
import { Button, Text, clx } from "@modules/common/components/ui"
import JoinWaitlist from "@modules/products/components/join-waitlist"
import ExtrasChooser, {
  chosenExtras,
} from "@modules/products/components/extras-chooser"
import { useParams, useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"

// Book a service (TASKS P3-13): pick the variant (a length, or a party size for
// a table, P3-19), a day and a free
// time, then the slot is held and added to the cart (POST /store/booking/cart,
// hold for BOOKING_HOLD_MINUTES). Times are the resource's local time.
export default function BookingPicker({
  product,
  signedIn = false,
  passes = [],
}: {
  product: HttpTypes.StoreProduct
  signedIn?: boolean
  // The customer's passes that cover this service and have credits (P3-29).
  passes?: MyPass[]
}) {
  const [passId, setPassId] = useState("")
  // Every week (P3-29): 1 = once.
  const [weeks, setWeeks] = useState(1)
  const [every, setEvery] = useState<"week" | "2weeks" | "month">("week")
  const router = useRouter()
  const countryCode = useParams().countryCode as string
  const services = useMemo(
    () =>
      orderedServices(
        (product.variants ?? []).filter((v) => durationMinutes(v) !== null)
      ),
    [product.variants]
  )
  const [variantId, setVariantId] = useState(services[0]?.id ?? "")
  const [date, setDate] = useState(() => localDate(null))
  const [slots, setSlots] = useState<Slot[]>([])
  // The chosen time and any error belong to one service, day and length:
  // they are kept with that key and read only while it's current, so a new
  // day or service starts clean without resetting state in an effect.
  const [picked, setPicked] = useState<{
    key: string
    slot: Slot | null
    error: string | null
  }>({ key: "", slot: null, error: null })
  // Loading is plain state with a request counter, not a transition: an
  // async transition around a server action could stay pending on first
  // load (the slots came back but "Loading times…" never ended). Only the
  // newest request may set the result.
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const requestId = useRef(0)
  const [booking, startBooking] = useTransition()
  // A visit at the customer's place (kind B, P3-20): where and what.
  const visit = isVisitService(product)
  const [address, setAddress] = useState("")
  const [problem, setProblem] = useState("")
  // A trip (kind C, P3-21): pickup, drop-off, and hours or two zones. The
  // backend sets the price; the one shown here is from the same rules.
  const trip = tripPricing(product)
  const [dropoff, setDropoff] = useState("")
  const variant = services.find((v) => v.id === variantId)
  const [chosenHours, setHours] = useState(() => minHours(services[0]))
  // Never below the chosen vehicle's minimum (a larger truck may need more).
  const hours = Math.max(chosenHours, minHours(variant))
  const [zones, setZones] = useState<TripZones>({ zones: [], prices: [] })
  const [fromZone, setFromZone] = useState("")
  const [toZone, setToZone] = useState("")
  const zoneRow =
    trip === "zones" ? zonePrice(zones.prices, fromZone, toZone) : null
  const tripMinutes =
    trip === "hours"
      ? hours * 60
      : trip === "zones"
      ? zoneRow?.minutes ?? null
      : undefined
  const tripReady =
    !trip ||
    (address.trim().length >= 5 &&
      dropoff.trim().length >= 5 &&
      (trip === "hours" || !!zoneRow))
  // A scheduled departure (kind D, P3-23): how many seats, never more than
  // the departure has left.
  const departure = isDepartureService(product)
  const [seats, setSeats] = useState(1)
  // Extras the service offers (P3-25), each with a quantity.
  const [extraQty, setExtraQty] = useState<Record<string, number>>({})
  const visitReady = trip
    ? tripReady
    : !visit || (address.trim().length >= 5 && problem.trim().length > 0)

  useEffect(() => {
    if (trip === "zones" && variantId) {
      listTripZones(variantId).then(setZones)
    }
  }, [trip, variantId])

  // Book stays pressable: a press with something missing shows the error at
  // that field and focuses it (design critique, 2026-11-23).
  const [showMissing, setShowMissing] = useState(false)
  const missing: { id: string; text: string } | null = !trip
    ? visit && address.trim().length < 5
      ? {
          id: "booking-address",
          text: "Add the address for the visit (at least 5 characters).",
        }
      : visit && !problem.trim()
      ? { id: "booking-problem", text: "Say what needs doing." }
      : null
    : address.trim().length < 5
    ? {
        id: "booking-pickup",
        text: "Add the pickup address (at least 5 characters).",
      }
    : dropoff.trim().length < 5
    ? {
        id: "booking-dropoff",
        text: "Add the drop-off address (at least 5 characters).",
      }
    : trip === "zones" && !zoneRow
    ? { id: "booking-from-zone", text: "Choose two areas that have a price." }
    : null
  const fieldError = (id: string) =>
    showMissing && missing?.id === id ? (
      <Text
        id={`${id}-error`}
        role="alert"
        className="txt-small text-ui-fg-error"
      >
        {missing.text}
      </Text>
    ) : null
  const errProps = (id: string) =>
    showMissing && missing?.id === id
      ? { "aria-invalid": true, "aria-describedby": `${id}-error` }
      : {}

  const slotKey = `${variantId}|${date}|${tripMinutes}`
  const chosen = picked.key === slotKey ? picked.slot : null
  const error = picked.key === slotKey ? picked.error : null
  const setChosen = (slot: Slot | null) =>
    setPicked((p) => ({
      key: slotKey,
      slot,
      error: p.key === slotKey ? p.error : null,
    }))
  const setError = (e: string | null) =>
    setPicked((p) => ({
      key: slotKey,
      slot: p.key === slotKey ? p.slot : null,
      error: e,
    }))

  const loadSlots = useCallback(() => {
    if (!variantId || !date || tripMinutes === null) {
      setLoading(false)
      return
    }
    const id = ++requestId.current
    const key = `${variantId}|${date}|${tripMinutes}`
    setLoading(true)
    setLoadError(null)
    listSlots(variantId, date, tripMinutes)
      .then((result) => {
        if (id !== requestId.current) return
        setSlots(result.slots)
        setLoadError(result.error ?? null)
        setPicked({ key, slot: null, error: null })
      })
      .catch(() => {
        if (id !== requestId.current) return
        setSlots([])
        setLoadError("Could not load times.")
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false)
      })
  }, [variantId, date, tripMinutes])

  useEffect(() => {
    loadSlots()
  }, [loadSlots])

  const book = () => {
    if (!chosen) {
      setShowMissing(true)
      document.getElementById("booking-times")?.focus()
      return
    }
    if (!visitReady || missing) {
      setShowMissing(true)
      document.getElementById(missing?.id ?? "")?.focus()
      return
    }
    startBooking(async () => {
      const result =
        weeks > 1
          ? await addRecurringToCart({
              countryCode,
              variantId,
              slot: chosen,
              weeks,
              every,
              ...(visit
                ? { address: address.trim(), notes: problem.trim() }
                : {}),
            })
          : await addBookingToCart({
              countryCode,
              variantId,
              slot: chosen,
              ...(visit
                ? { address: address.trim(), notes: problem.trim() }
                : {}),
              ...(trip
                ? {
                    address: address.trim(),
                    dropoffAddress: dropoff.trim(),
                    ...(trip === "hours"
                      ? { hours }
                      : { fromZoneId: fromZone, toZoneId: toZone }),
                  }
                : {}),
              ...(departure ? { seats } : {}),
              ...(passId ? { passId } : {}),
              extras: chosenExtras(extraQty),
            })
      if (result.error) {
        setError(result.error)
        // Someone else may have taken it: refresh the times.
        const fresh = await listSlots(variantId, date, tripMinutes ?? undefined)
        setSlots(fresh.slots)
        setChosen(null)
        return
      }
      router.push(`/${countryCode}/cart`)
    })
  }

  const price = (v: HttpTypes.StoreProductVariant) =>
    v.calculated_price?.calculated_amount != null
      ? convertToLocale({
          amount: v.calculated_price.calculated_amount,
          currency_code: v.calculated_price.currency_code ?? "usd",
        })
      : ""

  return (
    <div className="flex flex-col gap-y-4" data-testid="booking-picker">
      {services.length > 1 && (
        <div className="flex flex-col gap-y-2">
          <Text className="txt-compact-small-plus">
            {serviceChoiceLabel(product)}
          </Text>
          <div className="flex flex-wrap gap-2">
            {services.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setVariantId(v.id)}
                aria-pressed={v.id === variantId}
                className={clx(
                  "border rounded-md px-3 py-2 min-h-11 txt-small",
                  {
                    "border-ui-border-interactive bg-ui-bg-subtle":
                      v.id === variantId,
                    "border-ui-border-base": v.id !== variantId,
                  }
                )}
                data-testid="booking-length"
              >
                {v.title}{" "}
                {price(v) && (
                  <span className="text-ui-fg-subtle">· {price(v)}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
      {trip && (
        <div className="flex flex-col gap-y-3" data-testid="booking-trip">
          <label className="flex flex-col gap-y-2">
            <Text className="txt-compact-small-plus">Pickup address</Text>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              maxLength={300}
              className="border border-ui-border-base rounded-md px-3 min-h-11 txt-small"
              aria-label="Pickup address"
              data-testid="booking-pickup"
              id="booking-pickup"
              {...errProps("booking-pickup")}
            />
            {fieldError("booking-pickup")}
          </label>
          <label className="flex flex-col gap-y-2">
            <Text className="txt-compact-small-plus">Drop-off address</Text>
            <input
              value={dropoff}
              onChange={(e) => setDropoff(e.target.value)}
              maxLength={300}
              className="border border-ui-border-base rounded-md px-3 min-h-11 txt-small"
              aria-label="Drop-off address"
              data-testid="booking-dropoff"
              id="booking-dropoff"
              {...errProps("booking-dropoff")}
            />
            {fieldError("booking-dropoff")}
          </label>
          {trip === "hours" && variant && (
            <label className="flex flex-col gap-y-2">
              <Text className="txt-compact-small-plus">How many hours</Text>
              <select
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
                className="border border-ui-border-base rounded-md px-3 min-h-11 txt-small"
                aria-label="How many hours"
                data-testid="booking-hours"
              >
                {Array.from(
                  { length: MAX_TRIP_HOURS - minHours(variant) + 1 },
                  (_, i) => minHours(variant) + i
                ).map((h) => (
                  <option key={h} value={h}>
                    {h} hours
                    {variant.calculated_price?.calculated_amount != null
                      ? ` · ${convertToLocale({
                          amount:
                            variant.calculated_price.calculated_amount * h,
                          currency_code:
                            variant.calculated_price.currency_code ?? "usd",
                        })}`
                      : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          {trip === "zones" && (
            <div className="grid grid-cols-2 gap-2">
              {[
                {
                  label: "From",
                  value: fromZone,
                  set: setFromZone,
                  id: "booking-from-zone",
                },
                {
                  label: "To",
                  value: toZone,
                  set: setToZone,
                  id: "booking-to-zone",
                },
              ].map((f) => (
                <label key={f.id} className="flex flex-col gap-y-2">
                  <Text className="txt-compact-small-plus">{f.label}</Text>
                  <select
                    value={f.value}
                    onChange={(e) => f.set(e.target.value)}
                    className="border border-ui-border-base rounded-md px-3 min-h-11 txt-small"
                    aria-label={`${f.label} area`}
                    data-testid={f.id}
                    id={f.id}
                    {...(f.id === "booking-from-zone" ? errProps(f.id) : {})}
                  >
                    <option value="">Choose an area</option>
                    {zones.zones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <Text
                className="col-span-2 txt-small text-ui-fg-subtle"
                data-testid="booking-zone-price"
              >
                {zoneRow
                  ? `${convertToLocale({
                      amount: Number(zoneRow.amount),
                      currency_code: zoneRow.currency_code,
                    })} · about ${zoneRow.minutes} minutes`
                  : fromZone && toZone
                  ? "No price between these two areas. Try others or contact us."
                  : "Choose both areas to see the price."}
              </Text>
              <div className="col-span-2">
                {fieldError("booking-from-zone")}
              </div>
            </div>
          )}
        </div>
      )}
      {departure && (
        <label className="flex flex-col gap-y-2">
          <Text className="txt-compact-small-plus">Seats</Text>
          <select
            value={seats}
            onChange={(e) => {
              setSeats(Number(e.target.value))
              setChosen(null)
            }}
            className="border border-ui-border-base rounded-md px-3 min-h-11 txt-small"
            aria-label="Seats"
            data-testid="booking-seats"
          >
            {Array.from({ length: maxSeats(product) }, (_, i) => i + 1).map(
              (n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? "seat" : "seats"}
                  {variant?.calculated_price?.calculated_amount != null
                    ? ` · ${convertToLocale({
                        amount: variant.calculated_price.calculated_amount * n,
                        currency_code:
                          variant.calculated_price.currency_code ?? "usd",
                      })}`
                    : ""}
                </option>
              )
            )}
          </select>
        </label>
      )}
      <div className="flex flex-col gap-y-2">
        <Text className="txt-compact-small-plus">Day</Text>
        <input
          type="date"
          value={date}
          min={localDate(null)}
          onChange={(e) => setDate(e.target.value)}
          className="border border-ui-border-base rounded-md px-3 min-h-11 txt-small"
          aria-label="Day"
          data-testid="booking-date"
        />
      </div>
      <div className="flex flex-col gap-y-2">
        <Text className="txt-compact-small-plus" id="booking-times-label">
          Time{" "}
          {/* Which clock the slots are in, as booking sites show (ui-compare). */}
          <span className="txt-small text-ui-fg-subtle">
            ({(slots[0]?.timezone || "Asia/Phnom_Penh").split("/").pop()!.replace(/_/g, " ")} time)
          </span>
        </Text>
        <div aria-live="polite" className="contents">
          {loading && (
            <Text className="txt-small text-ui-fg-subtle">Loading times…</Text>
          )}
          {!loading && slots.length > 0 && (
            <span className="sr-only">{slots.length} free times.</span>
          )}
        </div>
        {showMissing && !chosen && !loading && slots.length > 0 && (
          <Text role="alert" className="txt-small text-ui-fg-error">
            Choose a time.
          </Text>
        )}
        {!loading && loadError && (
          <div
            className="flex flex-wrap items-center gap-2"
            data-testid="booking-slots-error"
          >
            <Text role="alert" className="txt-small text-ui-fg-error">
              Could not load times. Check your connection and try again.
            </Text>
            <button
              type="button"
              className="min-h-11 px-2 txt-small text-ui-fg-interactive underline"
              onClick={loadSlots}
              data-testid="booking-slots-retry"
            >
              Retry
            </button>
          </div>
        )}
        {!loading && !loadError && slots.length === 0 && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Text className="txt-small text-ui-fg-subtle">
                No free times on this day.
              </Text>
              <button
                type="button"
                className="min-h-11 px-2 txt-small text-ui-fg-interactive underline"
                onClick={() => {
                  const d = new Date(`${date}T12:00:00Z`)
                  d.setUTCDate(d.getUTCDate() + 1)
                  setDate(d.toISOString().slice(0, 10))
                }}
                data-testid="booking-next-day"
              >
                Try the next day →
              </button>
            </div>
            {!trip && variantId && (
              <JoinWaitlist
                key={`${variantId}${date}`}
                variantId={variantId}
                date={date}
                signedIn={signedIn}
              />
            )}
          </>
        )}
        <div
          id="booking-times"
          tabIndex={-1}
          role="group"
          aria-labelledby="booking-times-label"
          aria-busy={loading}
          className={clx(
            "grid grid-cols-2 xsmall:grid-cols-3 gap-2 outline-none",
            { "opacity-50": loading }
          )}
        >
          {slots
            .filter((s) => !departure || s.remaining >= seats)
            .map((s) => (
              <button
                key={`${s.resource_id}-${s.starts_at}`}
                type="button"
                onClick={() => setChosen(s)}
                disabled={loading}
                aria-label={`${formatSlotTime(s.starts_at, s.timezone)}${
                  departure
                    ? `, ${s.remaining} seats left`
                    : s.resource_name
                    ? `, ${s.resource_name}`
                    : ""
                }`}
                aria-pressed={chosen === s}
                className={clx(
                  "border rounded-md px-2 py-2 min-h-11 txt-small text-left disabled:cursor-wait",
                  {
                    "border-ui-border-interactive bg-ui-bg-subtle":
                      chosen === s,
                    "border-ui-border-base": chosen !== s,
                  }
                )}
                data-testid="booking-slot"
              >
                <span className="block txt-small-plus">
                  {formatSlotTime(s.starts_at, s.timezone)}
                </span>
                {departure ? (
                  <span className="block text-ui-fg-subtle txt-xsmall">
                    {s.remaining} seats left
                  </span>
                ) : (
                  s.resource_name && (
                    <span className="block text-ui-fg-subtle txt-xsmall">
                      {s.resource_name}
                    </span>
                  )
                )}
              </button>
            ))}
        </div>
      </div>
      {visit && (
        <>
          <label className="flex flex-col gap-y-2">
            <Text className="txt-compact-small-plus">
              Address for the visit
            </Text>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={2}
              maxLength={300}
              placeholder="House or building, street, commune, district, province"
              className="border border-ui-border-base rounded-md px-3 min-h-11 txt-small"
              data-testid="booking-address"
              id="booking-address"
              {...errProps("booking-address")}
            />
            {fieldError("booking-address")}
          </label>
          <label className="flex flex-col gap-y-2">
            <Text className="txt-compact-small-plus">What needs doing?</Text>
            <textarea
              value={problem}
              onChange={(e) => setProblem(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Describe the problem or the job"
              className="border border-ui-border-base rounded-md px-3 min-h-11 txt-small"
              data-testid="booking-problem"
              id="booking-problem"
              {...errProps("booking-problem")}
            />
            {fieldError("booking-problem")}
          </label>
        </>
      )}
      {/* A series is booked without extras (review finding: they were
          dropped silently), so the list hides while Repeat is on. */}
      {weeks === 1 && (
        <ExtrasChooser
          product={product}
          countryCode={countryCode}
          value={extraQty}
          onChange={setExtraQty}
        />
      )}
      {error && (
        <Text
          role="alert"
          className="txt-small text-ui-fg-error"
          data-testid="booking-error"
        >
          {error}
        </Text>
      )}
      {!trip && !departure && (
        <div className="flex flex-col gap-y-2" data-testid="booking-repeat">
          <label className="flex min-h-11 items-center gap-x-3 txt-small">
            <input
              type="checkbox"
              className="h-5 w-5"
              checked={weeks > 1}
              onChange={(e) => {
                setWeeks(e.target.checked ? 4 : 1)
                if (e.target.checked) setPassId("")
              }}
            />
            Repeat this booking
          </label>
          {weeks > 1 && (
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-y-1 txt-small">
                How often
                <select
                  className="rounded-md border border-ui-border-base px-3 min-h-11"
                  value={every}
                  onChange={(e) =>
                    setEvery(e.target.value as "week" | "2weeks" | "month")
                  }
                >
                  <option value="week">every week</option>
                  <option value="2weeks">every 2 weeks</option>
                  <option value="month">every month</option>
                </select>
              </label>
              <label className="flex flex-col gap-y-1 txt-small">
                How many times
                <select
                  className="rounded-md border border-ui-border-base px-3 min-h-11"
                  value={weeks}
                  onChange={(e) => setWeeks(Number(e.target.value))}
                >
                  {[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                    <option key={n} value={n}>
                      {n} times
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </div>
      )}
      {passes.length > 0 && weeks === 1 && (
        <label
          className="flex min-h-11 items-center gap-x-3 txt-small"
          data-testid="booking-use-pass"
        >
          <input
            type="checkbox"
            checked={!!passId}
            onChange={(e) => setPassId(e.target.checked ? passes[0].id : "")}
          />
          Use my pass ({passes[0].title}: {passes[0].credits_left} of{" "}
          {passes[0].credits_total} left
          {departure && seats > 1 ? `; ${seats} seats take ${seats}` : ""})
        </label>
      )}
      <Button
        onClick={book}
        disabled={booking}
        isLoading={booking}
        className="w-full h-11"
        data-testid="booking-submit"
      >
        {!chosen
          ? "Choose a time"
          : !visitReady
          ? trip
            ? "Add both addresses" + (trip === "zones" ? " and the areas" : "")
            : "Add the address and the job"
          : `Book ${formatSlotTime(chosen.starts_at, chosen.timezone)}${
              weeks > 1 ? ` × ${weeks}` : ""
            }`}
      </Button>
      {depositPercent(product) !== null && (
        <Text
          className="txt-small text-ui-fg-subtle"
          data-testid="booking-deposit"
        >
          Pay a {depositPercent(product)}% deposit now; the rest at the venue.
        </Text>
      )}
      <Text className="txt-xsmall text-ui-fg-subtle">
        The time is held for you while you check out.
      </Text>
    </div>
  )
}
