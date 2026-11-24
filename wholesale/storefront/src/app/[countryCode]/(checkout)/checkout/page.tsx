import { retrieveCart } from "@/lib/data/cart"
import { retrieveCustomer } from "@/lib/data/customer"
import Wrapper from "@/modules/checkout/components/payment-wrapper"
import CheckoutForm from "@/modules/checkout/templates/checkout-form"
import CheckoutSummary from "@/modules/checkout/templates/checkout-summary"
import { B2BCart } from "@/types/global"
import { Metadata } from "next"
import { getCheckoutStep } from "@/lib/util/get-checkout-step"
import { notFound, redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Checkout",
}

export default async function Checkout(props: {
  params: Promise<{ countryCode: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const searchParams = await props.searchParams
  const cartId = searchParams.cartId as string
  const cart = (await retrieveCart(cartId)) as B2BCart

  if (!cart) {
    return notFound()
  }

  // Opened without a step (a bookmark, the back button, a typed URL): every
  // section would stay closed and the address one would spin for ever. Go to
  // the first unfinished step, as the cart drawer's checkout link does.
  const step = getCheckoutStep(cart)
  if (!searchParams.step && step) {
    const { countryCode } = await props.params
    const next = new URLSearchParams()
    if (cartId) next.set("cartId", cartId)
    next.set("step", step)
    redirect(`/${countryCode}/checkout?${next}`)
  }

  const customer = await retrieveCustomer()

  return (
    <Wrapper cart={cart}>
      <div className="grid grid-cols-1 small:grid-cols-[1fr_416px] content-container gap-2 py-24 h-full">
        <CheckoutForm cart={cart} customer={customer} />
        <div className="relative">
          <CheckoutSummary cart={cart} />
        </div>
      </div>
    </Wrapper>
  )
}
