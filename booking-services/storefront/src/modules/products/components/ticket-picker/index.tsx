"use client"

import { addTicketsToCart } from "@lib/data/booking"
import ExtrasChooser, { chosenExtras } from "@modules/products/components/extras-chooser"
import { convertToLocale } from "@lib/util/money"
import { HttpTypes } from "@medusajs/types"
import { Button, Text, clx } from "@modules/common/components/ui"
import { useParams, useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"

// Event tickets by section (TASKS P3-24): pick a date, a section and how
// many. The seats left are the variant's inventory; Medusa refuses more than
// that at add-to-cart and checkout.
const optionValue = (v: HttpTypes.StoreProductVariant, title: string) =>
  v.options?.find((o) => o.option?.title === title)?.value ?? ""

export default function TicketPicker({ product }: { product: HttpTypes.StoreProduct }) {
  const router = useRouter()
  const countryCode = useParams().countryCode as string
  const variants = useMemo(() => product.variants ?? [], [product.variants])
  // In show order (each variant's metadata.event_starts_at).
  const dates = useMemo(() => {
    const startOf = (v: HttpTypes.StoreProductVariant) => String((v.metadata as Record<string, unknown> | null)?.event_starts_at ?? "")
    const sorted = [...variants].sort((a, b) => startOf(a).localeCompare(startOf(b)))
    return Array.from(new Set(sorted.map((v) => optionValue(v, "Show date")))).filter(Boolean)
  }, [variants])
  const [date, setDate] = useState(dates[0] ?? "")
  const sections = variants.filter((v) => optionValue(v, "Show date") === date)
  const [variantId, setVariantId] = useState("")
  const chosen = sections.find((v) => v.id === variantId) ?? null
  const left = (v: HttpTypes.StoreProductVariant) => (v.manage_inventory ? Math.max(v.inventory_quantity ?? 0, 0) : 99)
  const [quantity, setQuantity] = useState(1)
  const [error, setError] = useState<string | null>(null)
  // Extras with the tickets (P3-25 follow-up).
  const [extraQty, setExtraQty] = useState<Record<string, number>>({})
  const [adding, startAdding] = useTransition()
  const max = chosen ? Math.min(left(chosen), 10) : 0
  const price = (v: HttpTypes.StoreProductVariant, n = 1) =>
    v.calculated_price?.calculated_amount != null
      ? convertToLocale({ amount: v.calculated_price.calculated_amount * n, currency_code: v.calculated_price.currency_code ?? "usd" })
      : ""

  const add = () => {
    if (!chosen) {
      return
    }
    setError(null)
    startAdding(async () => {
      const r = await addTicketsToCart({ countryCode, variantId: chosen.id, quantity, extras: chosenExtras(extraQty) })
      if (r.error) setError(r.error)
      else router.push(`/${countryCode}/cart`)
    })
  }

  return (
    <div className="flex flex-col gap-y-4" data-testid="ticket-picker">
      <label className="flex flex-col gap-y-2">
        <Text className="txt-compact-small-plus">Date</Text>
        <select
          value={date}
          onChange={(e) => {
            setDate(e.target.value)
            setVariantId("")
          }}
          className="border border-ui-border-base rounded-md px-3 py-2 txt-small"
          data-testid="ticket-date"
        >
          {dates.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-col gap-y-2">
        <Text className="txt-compact-small-plus">Section</Text>
        <div className="grid grid-cols-2 gap-2">
          {sections.map((v) => (
            <button
              key={v.id}
              type="button"
              disabled={left(v) < 1}
              onClick={() => {
                setVariantId(v.id)
                setQuantity(1)
              }}
              className={clx("border rounded-md px-3 py-2 txt-small text-left disabled:opacity-50", {
                "border-ui-border-interactive bg-ui-bg-subtle": v.id === variantId,
                "border-ui-border-base": v.id !== variantId,
              })}
              data-testid="ticket-section"
            >
              <span className="block txt-small-plus">
                {optionValue(v, "Section")} · {price(v)}
              </span>
              <span className="block text-ui-fg-subtle txt-xsmall">{left(v) > 0 ? `${left(v)} left` : "Sold out"}</span>
            </button>
          ))}
        </div>
      </div>
      {chosen && (
        <label className="flex flex-col gap-y-2">
          <Text className="txt-compact-small-plus">Tickets</Text>
          <select
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="border border-ui-border-base rounded-md px-3 py-2 txt-small"
            data-testid="ticket-quantity"
          >
            {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} · {price(chosen, n)}
              </option>
            ))}
          </select>
        </label>
      )}
      {error && (
        <Text className="txt-small text-ui-fg-error" data-testid="ticket-error">
          {error}
        </Text>
      )}
      <ExtrasChooser product={product} countryCode={countryCode} value={extraQty} onChange={setExtraQty} />
      <Button onClick={add} disabled={!chosen || adding} isLoading={adding} className="w-full h-10" data-testid="ticket-submit">
        {chosen ? `Add ${quantity} ${quantity === 1 ? "ticket" : "tickets"}` : "Choose a section"}
      </Button>
      <Text className="txt-xsmall text-ui-fg-subtle">Each ticket gets its own code, in your order and by email.</Text>
    </div>
  )
}
