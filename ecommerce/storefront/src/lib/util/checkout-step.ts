import { HttpTypes } from "@medusajs/types"

// The first checkout step the cart still needs. The cart summary links to it,
// and the checkout page sends a step-less visit there.
export function getCheckoutStep(cart: HttpTypes.StoreCart) {
  if (!cart?.shipping_address?.address_1 || !cart.email) {
    return "address"
  } else if (cart?.shipping_methods?.length === 0) {
    return "delivery"
  } else {
    return "payment"
  }
}
