import { retrieveCart } from "@lib/data/cart"
import { retrieveCustomer } from "@lib/data/customer"
import { getProductVendors } from "@lib/data/vendors"
import { productIdsOf } from "@lib/util/group-by-vendor"
import CartTemplate from "@modules/cart/templates"
import { Metadata } from "next"
import { notFound } from "next/navigation"

export const metadata: Metadata = {
  title: "Cart",
  description: "View your cart",
}

export default async function Cart() {
  const cart = await retrieveCart().catch((error) => {
    console.error(error)
    return notFound()
  })

  const customer = await retrieveCustomer()

  const vendors = await getProductVendors(productIdsOf(cart?.items))

  return <CartTemplate cart={cart} customer={customer} vendors={vendors} />
}
