import { listCategories } from "@lib/data/categories"
import { listProducts } from "@lib/data/products"
import { getProductPrice } from "@lib/util/get-product-price"
import { HttpTypes } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { Button, Heading, Text } from "@modules/common/components/ui"

// The home page by booking kind (TASKS P3-19, plan §9.3): one section per
// top-level category (the seed makes one per kind: Appointments, Table
// reservations, …), in the admin's category order, each listing its services
// with a Book button.
export default async function BookingKinds({ region }: { region: HttpTypes.StoreRegion }) {
  const categories = ((await listCategories()) ?? [])
    .filter((c) => !c.parent_category)
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))

  const sections = await Promise.all(
    categories.map(async (category) => {
      const {
        response: { products },
      } = await listProducts({
        regionId: region.id,
        queryParams: { category_id: [category.id], limit: 12 },
      })
      return { category, products }
    })
  )

  return (
    <div className="content-container flex flex-col gap-y-16 py-12" data-testid="booking-kinds">
      {sections
        .filter((s) => s.products.length > 0)
        .map(({ category, products }) => (
          <section key={category.id} className="flex flex-col gap-y-6">
            <div className="flex flex-col gap-y-1">
              <LocalizedClientLink href={`/categories/${category.handle}`}>
                <Heading level="h2" className="txt-xlarge text-ui-fg-base">
                  {category.name}
                </Heading>
              </LocalizedClientLink>
              {category.description && <Text className="text-ui-fg-subtle">{category.description}</Text>}
            </div>
            <ul className="grid grid-cols-1 small:grid-cols-2 medium:grid-cols-3 gap-6">
              {products.map((product) => (
                <li key={product.id}>
                  <ServiceCard product={product} />
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  )
}

function ServiceCard({ product }: { product: HttpTypes.StoreProduct }) {
  const { cheapestPrice } = getProductPrice({ product })
  // "From" only when the choices cost different amounts (a haircut by length,
  // not a table whose deposit is the same for every party size).
  const several =
    new Set((product.variants ?? []).map((v) => v.calculated_price?.calculated_amount)).size > 1
  return (
    <div
      className="flex h-full flex-col justify-between gap-y-4 rounded-rounded border border-ui-border-base p-6"
      data-testid="service-card"
    >
      <div className="flex flex-col gap-y-2">
        <Text className="txt-large-plus text-ui-fg-base">{product.title}</Text>
        {product.description && <Text className="text-ui-fg-subtle line-clamp-3">{product.description}</Text>}
      </div>
      <div className="flex items-center justify-between gap-x-4">
        <Text className="text-ui-fg-base">
          {cheapestPrice ? `${several ? "From " : ""}${cheapestPrice.calculated_price}` : ""}
        </Text>
        <LocalizedClientLink href={`/products/${product.handle}`}>
          <Button variant="primary" data-testid="book-button">
            Book
          </Button>
        </LocalizedClientLink>
      </div>
    </div>
  )
}
