import { HttpTypes } from "@medusajs/types"
import { isServiceOnlyCart } from "@lib/util/booking"

// The first checkout step the cart still needs. The cart summary links to it,
// and the checkout page sends a step-less visit there.
export function getCheckoutStep(cart: HttpTypes.StoreCart) {
  // Booked services only: the "address" step is the contact step (P3-13).
  if (isServiceOnlyCart(cart)) {
    return cart.email ? "payment" : "address"
  }
  if (!cart?.shipping_address?.address_1 || !cart.email) {
    return "address"
  } else if (cart?.shipping_methods?.length === 0) {
    return "delivery"
  } else {
    return "payment"
  }
}
