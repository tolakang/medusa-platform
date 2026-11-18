import { listProducts } from "@lib/data/products"
import { HttpTypes } from "@medusajs/types"
import { retrieveCustomer } from "@lib/data/customer"
import { listMyPasses } from "@lib/data/booking"
import { isEventProduct, isExtraProduct, isQuoteOnly, isServiceProduct, rentalUnit } from "@lib/util/booking"
import QuoteRequest from "@modules/products/components/quote-request"
import BookingPicker from "@modules/products/components/booking-picker"
import RentalPicker from "@modules/products/components/rental-picker"
import TicketPicker from "@modules/products/components/ticket-picker"
import ProductActions from "@modules/products/components/product-actions"

/**
 * Fetches real time pricing for a product and renders the product actions component.
 */
export default async function ProductActionsWrapper({
  id,
  region,
}: {
  id: string
  region: HttpTypes.StoreRegion
}) {
  const product = await listProducts({
    queryParams: { id: [id] },
    regionId: region.id,
  }).then(({ response }) => response.products[0])

  if (!product) {
    return null
  }

  // A bookable service gets the slot picker instead of "Add to cart" (P3-13).
  // An extra is added with a booking (TASKS P3-25), not on its own.
  if (isExtraProduct(product)) {
    return <p className="txt-small text-ui-fg-subtle">This is an extra: add it when you book the service it goes with.</p>
  }
  // Priced on request (TASKS P3-27).
  if (isQuoteOnly(product)) {
    const customer = await retrieveCustomer().catch(() => null)
    return <QuoteRequest product={product} signedIn={!!customer} />
  }
  // Event tickets by section (TASKS P3-24).
  if (isEventProduct(product)) {
    return <TicketPicker product={product} />
  }
  // A rental picks dates, not a time (TASKS P3-22).
  if (rentalUnit(product)) {
    return <RentalPicker product={product} />
  }
  if (isServiceProduct(product)) {
    // Signed in, a full day can be waited for (TASKS P3-29).
    const customer = await retrieveCustomer().catch(() => null)
    // Passes that cover this service, still valid, with credits (P3-29).
    const now = new Date().toISOString()
    const passes = customer
      ? (await listMyPasses()).filter(
          (p) => p.credits_left > 0 && p.expires_at > now && p.covers.some((c) => c.handle === product.handle)
        )
      : []
    return <BookingPicker product={product} signedIn={!!customer} passes={passes} />
  }
  return <ProductActions product={product} region={region} />
}
