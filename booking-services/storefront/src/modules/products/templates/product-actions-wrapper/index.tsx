import { listProducts } from "@lib/data/products"
import { HttpTypes } from "@medusajs/types"
import { isEventProduct, isServiceProduct, rentalUnit } from "@lib/util/booking"
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
  // Event tickets by section (TASKS P3-24).
  if (isEventProduct(product)) {
    return <TicketPicker product={product} />
  }
  // A rental picks dates, not a time (TASKS P3-22).
  if (rentalUnit(product)) {
    return <RentalPicker product={product} />
  }
  if (isServiceProduct(product)) {
    return <BookingPicker product={product} />
  }
  return <ProductActions product={product} region={region} />
}
