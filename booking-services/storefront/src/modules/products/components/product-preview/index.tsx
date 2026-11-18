import { Text } from "@modules/common/components/ui"
import { getProductPrice } from "@lib/util/get-product-price"
import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import Thumbnail from "../thumbnail"
import PreviewPrice from "./price"
import { reviewSummary } from "@lib/data/booking"
import { isServiceProduct } from "@lib/util/booking"

export default async function ProductPreview({
  product,
  isFeatured,
  region: _region,
}: {
  product: HttpTypes.StoreProduct
  isFeatured?: boolean
  region: HttpTypes.StoreRegion
}) {
  // const pricedProduct = await listProducts({
  //   regionId: region.id,
  //   queryParams: { id: [product.id!] },
  // }).then(({ response }) => response.products[0])

  // if (!pricedProduct) {
  //   return null
  // }

  const { cheapestPrice } = getProductPrice({
    product,
  })
  // A service's rating from customers who had it (P3-29 follow-up).
  const rating = isServiceProduct(product) ? await reviewSummary(product.id!) : null

  return (
    <LocalizedClientLink href={`/products/${product.handle}`} className="group">
      <div data-testid="product-wrapper">
        <Thumbnail
          thumbnail={product.thumbnail}
          images={product.images}
          size="full"
          isFeatured={isFeatured}
        />
        <div className="flex txt-compact-medium mt-4 justify-between">
          <div className="flex flex-col">
            <Text className="text-ui-fg-subtle" data-testid="product-title">
              {product.title}
            </Text>
            {rating?.count ? (
              <Text className="txt-small text-ui-fg-muted" data-testid="product-rating" aria-label={`Rated ${rating.average} out of 5`}>
                ★ {rating.average?.toFixed(1)} ({rating.count})
              </Text>
            ) : null}
          </div>
          <div className="flex items-center gap-x-2">
            {cheapestPrice && <PreviewPrice price={cheapestPrice} />}
          </div>
        </div>
      </div>
    </LocalizedClientLink>
  )
}
