"use client"

import { addBookingToCart, listExtras, listSlots, listTripZones, type Slot, type TripZones } from "@lib/data/booking"
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
  offeredExtras,
  orderedServices,
  serviceChoiceLabel,
  tripPricing,
  zonePrice,
} from "@lib/util/booking"
import { convertToLocale } from "@lib/util/money"
import { HttpTypes } from "@medusajs/types"
import { Button, Text, clx } from "@modules/common/components/ui"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useMemo, useState, useTransition } from "react"

// Book a service (TASKS P3-13): pick the variant (a length, or a party size for
// a table, P3-19), a day and a free
// time, then the slot is held and added to the cart (POST /store/booking/cart,
// hold for BOOKING_HOLD_MINUTES). Times are the resource's local time.
export default function BookingPicker({ product }: { product: HttpTypes.StoreProduct }) {
  const router = useRouter()
  const countryCode = useParams().countryCode as string
  const services = useMemo(
    () => orderedServices((product.variants ?? []).filter((v) => durationMinutes(v) !== null)),
    [product.variants]
  )
  const [variantId, setVariantId] = useState(services[0]?.id ?? "")
  const [date, setDate] = useState(() => localDate(null))
  const [slots, setSlots] = useState<Slot[]>([])
  const [chosen, setChosen] = useState<Slot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, startLoading] = useTransition()
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
  const zoneRow = trip === "zones" ? zonePrice(zones.prices, fromZone, toZone) : null
  const tripMinutes = trip === "hours" ? hours * 60 : trip === "zones" ? zoneRow?.minutes ?? null : undefined
  const tripReady =
    !trip || (address.trim().length >= 5 && dropoff.trim().length >= 5 && (trip === "hours" || !!zoneRow))
  // A scheduled departure (kind D, P3-23): how many seats, never more than
  // the departure has left.
  const departure = isDepartureService(product)
  const [seats, setSeats] = useState(1)
  // Extras the service offers (P3-25), each with a quantity.
  const [extras, setExtras] = useState<HttpTypes.StoreProduct[]>([])
  const [extraQty, setExtraQty] = useState<Record<string, number>>({})
  const extraHandles = offeredExtras(product).join(",")
  useEffect(() => {
    if (extraHandles) {
      listExtras(extraHandles.split(","), countryCode).then(setExtras)
    }
  }, [extraHandles, countryCode])
  const visitReady = trip ? tripReady : !visit || (address.trim().length >= 5 && problem.trim().length > 0)

  useEffect(() => {
    if (trip === "zones" && variantId) {
      listTripZones(variantId).then(setZones)
    }
  }, [trip, variantId])

  useEffect(() => {
    if (!variantId || !date || tripMinutes === null) {
      return
    }
    setChosen(null)
    setError(null)
    startLoading(async () => {
      const result = await listSlots(variantId, date, tripMinutes)
      setSlots(result.slots)
      setError(result.error ?? null)
    })
  }, [variantId, date, tripMinutes])

  const book = () => {
    if (!chosen || !visitReady) {
      return
    }
    startBooking(async () => {
      const result = await addBookingToCart({
        countryCode,
        variantId,
        slot: chosen,
        ...(visit ? { address: address.trim(), notes: problem.trim() } : {}),
        ...(trip
          ? {
              address: address.trim(),
              dropoffAddress: dropoff.trim(),
              ...(trip === "hours" ? { hours } : { fromZoneId: fromZone, toZoneId: toZone }),
            }
          : {}),
        ...(departure ? { seats } : {}),
        extras: Object.entries(extraQty)
          .filter(([, q]) => q > 0)
          .map(([variant_id, quantity]) => ({ variant_id, quantity })),
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
      ? convertToLocale({ amount: v.calculated_price.calculated_amount, currency_code: v.calculated_price.currency_code ?? "usd" })
      : ""

  return (
    <div className="flex flex-col gap-y-4" data-testid="booking-picker">
      {services.length > 1 && (
        <div className="flex flex-col gap-y-2">
          <Text className="txt-compact-small-plus">{serviceChoiceLabel(product)}</Text>
          <div className="flex flex-wrap gap-2">
            {services.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setVariantId(v.id)}
                className={clx("border rounded-md px-3 py-2 txt-small", {
                  "border-ui-border-interactive bg-ui-bg-subtle": v.id === variantId,
                  "border-ui-border-base": v.id !== variantId,
                })}
                data-testid="booking-length"
              >
                {v.title} {price(v) && <span className="text-ui-fg-subtle">· {price(v)}</span>}
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
              className="border border-ui-border-base rounded-md px-3 py-2 txt-small"
              data-testid="booking-pickup"
            />
          </label>
          <label className="flex flex-col gap-y-2">
            <Text className="txt-compact-small-plus">Drop-off address</Text>
            <input
              value={dropoff}
              onChange={(e) => setDropoff(e.target.value)}
              maxLength={300}
              className="border border-ui-border-base rounded-md px-3 py-2 txt-small"
              data-testid="booking-dropoff"
            />
          </label>
          {trip === "hours" && variant && (
            <label className="flex flex-col gap-y-2">
              <Text className="txt-compact-small-plus">How many hours</Text>
              <select
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
                className="border border-ui-border-base rounded-md px-3 py-2 txt-small"
                data-testid="booking-hours"
              >
                {Array.from({ length: MAX_TRIP_HOURS - minHours(variant) + 1 }, (_, i) => minHours(variant) + i).map((h) => (
                  <option key={h} value={h}>
                    {h} hours
                    {variant.calculated_price?.calculated_amount != null
                      ? ` · ${convertToLocale({ amount: variant.calculated_price.calculated_amount * h, currency_code: variant.calculated_price.currency_code ?? "usd" })}`
                      : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          {trip === "zones" && (
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "From", value: fromZone, set: setFromZone, id: "booking-from-zone" },
                { label: "To", value: toZone, set: setToZone, id: "booking-to-zone" },
              ].map((f) => (
                <label key={f.id} className="flex flex-col gap-y-2">
                  <Text className="txt-compact-small-plus">{f.label}</Text>
                  <select
                    value={f.value}
                    onChange={(e) => f.set(e.target.value)}
                    className="border border-ui-border-base rounded-md px-3 py-2 txt-small"
                    data-testid={f.id}
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
              <Text className="col-span-2 txt-small text-ui-fg-subtle" data-testid="booking-zone-price">
                {zoneRow
                  ? `${convertToLocale({ amount: Number(zoneRow.amount), currency_code: zoneRow.currency_code })} · about ${zoneRow.minutes} minutes`
                  : fromZone && toZone
                    ? "No price between these two areas. Try others or contact us."
                    : "Choose both areas to see the price."}
              </Text>
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
            className="border border-ui-border-base rounded-md px-3 py-2 txt-small"
            data-testid="booking-seats"
          >
            {Array.from({ length: maxSeats(product) }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? "seat" : "seats"}
                {variant?.calculated_price?.calculated_amount != null
                  ? ` · ${convertToLocale({ amount: variant.calculated_price.calculated_amount * n, currency_code: variant.calculated_price.currency_code ?? "usd" })}`
                  : ""}
              </option>
            ))}
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
          className="border border-ui-border-base rounded-md px-3 py-2 txt-small"
          data-testid="booking-date"
        />
      </div>
      <div className="flex flex-col gap-y-2">
        <Text className="txt-compact-small-plus">Time</Text>
        {loading && <Text className="txt-small text-ui-fg-subtle">Loading times…</Text>}
        {!loading && slots.length === 0 && (
          <Text className="txt-small text-ui-fg-subtle">No free times on this day. Try another day.</Text>
        )}
        <div className="grid grid-cols-3 gap-2">
          {slots.filter((s) => !departure || s.remaining >= seats).map((s) => (
            <button
              key={`${s.resource_id}-${s.starts_at}`}
              type="button"
              onClick={() => setChosen(s)}
              className={clx("border rounded-md px-2 py-2 txt-small text-left", {
                "border-ui-border-interactive bg-ui-bg-subtle": chosen === s,
                "border-ui-border-base": chosen !== s,
              })}
              data-testid="booking-slot"
            >
              <span className="block txt-small-plus">{formatSlotTime(s.starts_at, s.timezone)}</span>
              {departure ? (
                <span className="block text-ui-fg-subtle txt-xsmall">{s.remaining} seats left</span>
              ) : (
                s.resource_name && <span className="block text-ui-fg-subtle txt-xsmall">{s.resource_name}</span>
              )}
            </button>
          ))}
        </div>
      </div>
      {visit && (
        <>
          <label className="flex flex-col gap-y-2">
            <Text className="txt-compact-small-plus">Address for the visit</Text>
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={2}
              maxLength={300}
              placeholder="House or building, street, commune, district, province"
              className="border border-ui-border-base rounded-md px-3 py-2 txt-small"
              data-testid="booking-address"
            />
          </label>
          <label className="flex flex-col gap-y-2">
            <Text className="txt-compact-small-plus">What needs doing?</Text>
            <textarea
              value={problem}
              onChange={(e) => setProblem(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Describe the problem or the job"
              className="border border-ui-border-base rounded-md px-3 py-2 txt-small"
              data-testid="booking-problem"
            />
          </label>
        </>
      )}
      {extras.length > 0 && (
        <div className="flex flex-col gap-y-2" data-testid="booking-extras">
          <Text className="txt-compact-small-plus">Extras</Text>
          {extras.map((x) => {
            const v = x.variants?.[0]
            if (!v) return null
            const q = extraQty[v.id] ?? 0
            return (
              <div key={x.id} className="flex items-center justify-between gap-2 border border-ui-border-base rounded-md px-3 py-2">
                <span className="flex flex-col">
                  <span className="txt-small-plus">{x.title}</span>
                  <span className="txt-xsmall text-ui-fg-subtle">
                    {v.calculated_price?.calculated_amount != null
                      ? `${convertToLocale({ amount: v.calculated_price.calculated_amount, currency_code: v.calculated_price.currency_code ?? "usd" })} each`
                      : ""}
                    {x.description ? ` · ${x.description}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={`Fewer ${x.title}`}
                    disabled={q === 0}
                    onClick={() => setExtraQty({ ...extraQty, [v.id]: Math.max(q - 1, 0) })}
                    className="border border-ui-border-base rounded-md w-8 h-8 disabled:opacity-40"
                  >
                    −
                  </button>
                  <span className="w-6 text-center txt-small" data-testid="extra-quantity">
                    {q}
                  </span>
                  <button
                    type="button"
                    aria-label={`More ${x.title}`}
                    disabled={q >= 20}
                    onClick={() => setExtraQty({ ...extraQty, [v.id]: Math.min(q + 1, 20) })}
                    className="border border-ui-border-base rounded-md w-8 h-8 disabled:opacity-40"
                  >
                    +
                  </button>
                </span>
              </div>
            )
          })}
        </div>
      )}
      {error && (
        <Text className="txt-small text-ui-fg-error" data-testid="booking-error">
          {error}
        </Text>
      )}
      <Button onClick={book} disabled={!chosen || !visitReady || booking} isLoading={booking} className="w-full h-10" data-testid="booking-submit">
        {!chosen
          ? "Choose a time"
          : !visitReady
            ? trip
              ? "Add both addresses" + (trip === "zones" ? " and the areas" : "")
              : "Add the address and the job"
            : `Book ${formatSlotTime(chosen.starts_at, chosen.timezone)}`}
      </Button>
      {depositPercent(product) !== null && (
        <Text className="txt-small text-ui-fg-subtle" data-testid="booking-deposit">
          Pay a {depositPercent(product)}% deposit now; the rest at the venue.
        </Text>
      )}
      <Text className="txt-xsmall text-ui-fg-subtle">The time is held for you while you check out.</Text>
    </div>
  )
}
