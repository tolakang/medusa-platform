"use client"

import { listExtras } from "@lib/data/booking"
import { offeredExtras } from "@lib/util/booking"
import { convertToLocale } from "@lib/util/money"
import { HttpTypes } from "@medusajs/types"
import { Text } from "@modules/common/components/ui"
import { useEffect, useState } from "react"

// Extras a service offers (TASKS P3-25: product Metadata `extras`, the
// handles of extra products), each with a quantity. Shared by the booking,
// rental and ticket pickers.
export default function ExtrasChooser({
  product,
  countryCode,
  value,
  onChange,
}: {
  product: HttpTypes.StoreProduct
  countryCode: string
  value: Record<string, number>
  onChange: (next: Record<string, number>) => void
}) {
  const [extras, setExtras] = useState<HttpTypes.StoreProduct[]>([])
  const handles = offeredExtras(product).join(",")
  useEffect(() => {
    if (handles) {
      listExtras(handles.split(","), countryCode).then(setExtras)
    }
  }, [handles, countryCode])
  return (
    <>
      {extras.length > 0 && (
        <div className="flex flex-col gap-y-2" data-testid="booking-extras">
          <Text className="txt-compact-small-plus">Extras</Text>
          {extras.map((x) => {
            const v = x.variants?.[0]
            if (!v) return null
            const q = value[v.id] ?? 0
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
                    onClick={() => onChange({ ...value, [v.id]: Math.max(q - 1, 0) })}
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
                    onClick={() => onChange({ ...value, [v.id]: Math.min(q + 1, 20) })}
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
    </>
  )
}

/** The chosen extras as cart input. */
export const chosenExtras = (value: Record<string, number>) =>
  Object.entries(value)
    .filter(([, q]) => q > 0)
    .map(([variant_id, quantity]) => ({ variant_id, quantity }))
