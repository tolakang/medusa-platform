import { listPriceTiers } from "@/lib/data/price-tiers"
import { convertToLocale } from "@/lib/util/money"
import { sameTiers, tierRange } from "@/lib/util/price-tiers"
import { HttpTypes } from "@medusajs/types"
import { Text } from "@medusajs/ui"

// Polish 2026-11-25: the buyer's quantity price breaks ("1–9 €47.20 /
// 10+ €44.25"), from GET /store/price-tiers. Nothing shows when the
// product has a single price for every quantity.
export default async function PriceTiers({
  product,
  region,
}: {
  product: HttpTypes.StoreProduct
  region: HttpTypes.StoreRegion
}) {
  const variants = product.variants ?? []
  const all = await listPriceTiers(
    variants.map((v) => v.id),
    region.id
  )
  const withBreaks = all.filter((v) => v.tiers.length > 1)
  if (!withBreaks.length) return null

  const shared = withBreaks.every(
    (v) =>
      v.tiers.length === withBreaks[0].tiers.length &&
      sameTiers(v.tiers, withBreaks[0].tiers)
  )
  const rows = shared && withBreaks.length === all.length
    ? [{ label: null as string | null, entry: withBreaks[0] }]
    : withBreaks.map((entry) => ({
        label:
          variants.find((v) => v.id === entry.variant_id)?.title ?? null,
        entry,
      }))

  return (
    <div className="flex flex-col gap-y-1 w-full" data-testid="price-tiers">
      <Text className="text-small-plus text-ui-fg-base">Volume pricing</Text>
      {rows.map(({ label, entry }) => (
        <div
          key={entry.variant_id}
          className="flex flex-wrap gap-x-3 gap-y-1 text-small-regular text-ui-fg-subtle"
        >
          {label && <span className="text-ui-fg-base">{label}:</span>}
          {entry.tiers.map((tier, i) => (
            <span key={tier.min_quantity}>
              {i > 0 && <span className="mr-3 text-ui-fg-muted">/</span>}
              {tierRange(tier)}{" "}
              <span className="text-ui-fg-base">
                {convertToLocale({
                  amount: tier.amount,
                  currency_code: entry.currency_code,
                })}
              </span>
            </span>
          ))}
        </div>
      ))}
      <Text className="text-xs text-ui-fg-muted">
        Unit price by quantity per line, applied in your cart.
      </Text>
    </div>
  )
}
