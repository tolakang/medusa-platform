import { retrieveCart } from "@lib/data/cart"
import { retrieveCustomer } from "@lib/data/customer"
import PaymentWrapper from "@modules/checkout/components/payment-wrapper"
import CheckoutForm from "@modules/checkout/templates/checkout-form"
import CheckoutSummary from "@modules/checkout/templates/checkout-summary"
import { Metadata } from "next"
import { getCheckoutStep } from "@lib/util/checkout-step"
import { notFound, redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Checkout",
}

export default async function Checkout(props: {
  params: Promise<{ countryCode: string }>
  searchParams: Promise<{ step?: string }>
}) {
  const cart = await retrieveCart()

  if (!cart) {
    return notFound()
  }

  // Opened without a step (a bookmark, the back button, a typed URL): every
  // section stays closed and an empty address shows as done. Go to the first
  // step the cart still needs, as the cart's checkout button does.
  if (!(await props.searchParams).step) {
    const { countryCode } = await props.params
    redirect(`/${countryCode}/checkout?step=${getCheckoutStep(cart)}`)
  }

  const customer = await retrieveCustomer()

  return (
    <div className="grid grid-cols-1 small:grid-cols-[1fr_416px] content-container gap-x-40 py-12">
      <PaymentWrapper cart={cart}>
        <CheckoutForm cart={cart} customer={customer} />
      </PaymentWrapper>
      <CheckoutSummary cart={cart} />
    </div>
  )
}
