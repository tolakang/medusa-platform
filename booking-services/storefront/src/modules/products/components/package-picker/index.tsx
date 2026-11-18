"use client"

import { addPackageToCart } from "@lib/data/booking"
import { localDate, paymentPlanText } from "@lib/util/booking"
import { convertToLocale } from "@lib/util/money"
import { HttpTypes } from "@medusajs/types"
import { Button, Text } from "@modules/common/components/ui"
import { useParams, useRouter } from "next/navigation"
import { useState, useTransition } from "react"

// An event package (TASKS P3-30, kind H): pick the event date; every piece is
// booked together on it, or none (the shop says which piece isn't free). À la
// carte (Metadata package_mode "a_la_carte"): the customer ticks the pieces,
// each at its own price.
export default function PackagePicker({ product }: { product: HttpTypes.StoreProduct }) {
  const { countryCode } = useParams() as { countryCode: string }
  const router = useRouter()
  const variant = product.variants?.[0]
  const price = variant?.calculated_price?.calculated_amount
  const currency = variant?.calculated_price?.currency_code ?? "usd"
  const [date, setDate] = useState("")
  const [address, setAddress] = useState("")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [tomorrow] = useState(() => localDate(null, 1))
  const meta = (product.metadata ?? {}) as Record<string, unknown>
  const aLaCarte = meta.package_mode === "a_la_carte"
  const items = (Array.isArray(meta.package_items) ? meta.package_items : []) as { label?: string; sku: string }[]
  const [chosen, setChosen] = useState<number[]>([])
  const field = "w-full rounded-md border border-ui-border-base bg-ui-bg-field px-3 py-2 txt-medium"

  return (
    <div className="flex flex-col gap-y-3" data-testid="package-picker">
      {aLaCarte ? (
        <fieldset className="flex flex-col gap-y-2" data-testid="package-choices">
          <legend className="txt-medium-plus mb-1">Choose what you need</legend>
          {items.map((it, i) => (
            <label key={i} className="flex items-center gap-x-2 txt-small">
              <input
                type="checkbox"
                checked={chosen.includes(i)}
                onChange={(e) => setChosen((c) => (e.target.checked ? [...c, i] : c.filter((x) => x !== i)))}
              />
              {it.label ?? it.sku}
            </label>
          ))}
          <Text className="txt-xsmall text-ui-fg-subtle">Each part at its own price; the cart shows the total.</Text>
        </fieldset>
      ) : (
        price != null && <p className="text-xl-semi">{convertToLocale({ amount: price, currency_code: currency })}</p>
      )}
      <label className="flex flex-col gap-y-1 txt-small">
        Event date
        <input className={field} type="date" min={tomorrow} value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="flex flex-col gap-y-1 txt-small">
        Event address (if a piece comes to you)
        <input className={field} value={address} onChange={(e) => setAddress(e.target.value)} />
      </label>
      <label className="flex flex-col gap-y-1 txt-small">
        Notes for the shop
        <textarea className={field} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>
      {error && (
        <Text className="txt-small text-ui-fg-error" data-testid="package-error">
          {error}
        </Text>
      )}
      <Button
        className="w-full h-10"
        disabled={!date || !variant || (aLaCarte && !chosen.length)}
        isLoading={pending}
        data-testid="package-submit"
        onClick={() =>
          start(async () => {
            setError(null)
            const r = await addPackageToCart({
              countryCode,
              variantId: variant!.id,
              date,
              address: address.trim(),
              notes: notes.trim(),
              ...(aLaCarte ? { choices: chosen } : {}),
            })
            if (r.error) setError(r.error)
            else router.push(`/${countryCode}/cart`)
          })
        }
      >
        {date ? `Book the package on ${date}` : "Choose the event date"}
      </Button>
      {paymentPlanText(product.metadata) && (
        <Text className="txt-small text-ui-fg-subtle" data-testid="package-plan">
          {paymentPlanText(product.metadata)}
        </Text>
      )}
      <Text className="txt-xsmall text-ui-fg-subtle">Every part is held for you while you check out, and confirmed together.</Text>
    </div>
  )
}
