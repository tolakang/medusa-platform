"use client"

import { addRentalToCart, rentalAvailability, type RentalAvailability } from "@lib/data/booking"
import { localDate, orderedServices, rentalUnit, serviceChoiceLabel } from "@lib/util/booking"
import { convertToLocale } from "@lib/util/money"
import { HttpTypes } from "@medusajs/types"
import { Button, Text, clx } from "@modules/common/components/ui"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useMemo, useState, useTransition } from "react"

// Rent by dates (TASKS P3-22): pick the size, a start and an end date (days
// inclusive, or check-in and check-out for nights); the shop says how many
// days or nights, the total and whether one is free, then holds it and adds
// it to the cart. The backend sets the price from the same dates.
export default function RentalPicker({ product }: { product: HttpTypes.StoreProduct }) {
  const router = useRouter()
  const countryCode = useParams().countryCode as string
  const unit = rentalUnit(product) ?? "day"
  const sizes = useMemo(() => orderedServices(product.variants ?? []), [product.variants])
  const [variantId, setVariantId] = useState(sizes[0]?.id ?? "")
  const today = localDate(null)
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [found, setFound] = useState<RentalAvailability | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [checking, startChecking] = useTransition()
  const [booking, startBooking] = useTransition()
  const variant = sizes.find((v) => v.id === variantId)
  const perUnit = variant?.calculated_price?.calculated_amount
  const currency = variant?.calculated_price?.currency_code ?? "usd"
  const item = found?.items.find((i) => i.remaining > 0)

  useEffect(() => {
    if (!variantId || !start || !end) {
      return
    }
    startChecking(async () => {
      const result = await rentalAvailability(variantId, start, end)
      setFound(result.data ?? null)
      setError(result.error ?? null)
    })
  }, [variantId, start, end])

  const book = () => {
    if (!item) {
      return
    }
    startBooking(async () => {
      const result = await addRentalToCart({ countryCode, variantId, resourceId: item.resource_id, startDate: start, endDate: end })
      if (result.error) {
        setError(result.error)
        return
      }
      router.push(`/${countryCode}/cart`)
    })
  }

  const label = (n: number) => `${n} ${unit === "day" ? (n === 1 ? "day" : "days") : n === 1 ? "night" : "nights"}`
  const ready = !!found && !!item && !checking

  return (
    <div className="flex flex-col gap-y-4" data-testid="rental-picker">
      {sizes.length > 1 && (
        <div className="flex flex-col gap-y-2">
          <Text className="txt-compact-small-plus">{serviceChoiceLabel(product)}</Text>
          <div className="flex flex-wrap gap-2">
            {sizes.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setVariantId(v.id)}
                className={clx("border rounded-md px-3 py-2 txt-small", {
                  "border-ui-border-interactive bg-ui-bg-subtle": v.id === variantId,
                  "border-ui-border-base": v.id !== variantId,
                })}
                data-testid="rental-size"
              >
                {v.title}
                {v.calculated_price?.calculated_amount != null && (
                  <span className="text-ui-fg-subtle">
                    {" "}
                    · {convertToLocale({ amount: v.calculated_price.calculated_amount, currency_code: v.calculated_price.currency_code ?? "usd" })} / {unit}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-y-2">
          <Text className="txt-compact-small-plus">{unit === "night" ? "Check-in" : "From"}</Text>
          <input
            type="date"
            value={start}
            min={today}
            onChange={(e) => setStart(e.target.value)}
            className="border border-ui-border-base rounded-md px-3 py-2 txt-small"
            data-testid="rental-start"
          />
        </label>
        <label className="flex flex-col gap-y-2">
          <Text className="txt-compact-small-plus">{unit === "night" ? "Check-out" : "To"}</Text>
          <input
            type="date"
            value={end}
            min={start || today}
            onChange={(e) => setEnd(e.target.value)}
            className="border border-ui-border-base rounded-md px-3 py-2 txt-small"
            data-testid="rental-end"
          />
        </label>
      </div>
      <Text className="txt-small text-ui-fg-subtle" data-testid="rental-summary">
        {!start || !end
          ? unit === "night"
            ? "Choose your check-in and check-out dates."
            : "Choose the first and the last day."
          : checking
            ? "Checking these dates…"
            : found
              ? `${label(found.units)}${perUnit != null ? ` · ${convertToLocale({ amount: perUnit * found.units, currency_code: currency })}` : ""} · ${
                  item ? "available" : "not available on these dates"
                }`
              : ""}
      </Text>
      {error && (
        <Text className="txt-small text-ui-fg-error" data-testid="booking-error">
          {error}
        </Text>
      )}
      <Button onClick={book} disabled={!ready || booking} isLoading={booking} className="w-full h-10" data-testid="rental-submit">
        {ready ? `Book ${label(found!.units)}` : "Choose the dates"}
      </Button>
      <Text className="txt-xsmall text-ui-fg-subtle">It is held for you while you check out.</Text>
    </div>
  )
}
