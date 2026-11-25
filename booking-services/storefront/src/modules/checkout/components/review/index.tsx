"use client"

import { Heading, Text, clx } from "@modules/common/components/ui"

import PaymentButton from "../payment-button"
import { useSearchParams } from "next/navigation"
import { HttpTypes } from "@medusajs/types"
import { isServiceOnlyCart, noPaymentDue } from "@lib/util/booking"
import { hasRequiredContact } from "@lib/util/contact"
import { SHOP_NAME } from "@lib/shop"

const Review = ({ cart }: { cart: HttpTypes.StoreCart }) => {
  const searchParams = useSearchParams()

  const isOpen = searchParams.get("step") === "review"

  // $0 (pass credits, gift card): no payment method to choose.
  const nothingToPay = noPaymentDue(cart)

  // Booked services only: contact instead of address and delivery (P3-13).
  const previousStepsCompleted = isServiceOnlyCart(cart)
    ? hasRequiredContact(cart) && (cart.payment_collection || nothingToPay)
    : cart.shipping_address &&
      (cart.shipping_methods?.length ?? 0) > 0 &&
      (cart.payment_collection || nothingToPay)

  return (
    <div className="bg-white">
      <div className="flex flex-row items-center justify-between mb-6">
        <Heading
          level="h2"
          className={clx(
            "flex flex-row text-3xl-regular gap-x-2 items-baseline",
            {
              "opacity-50 pointer-events-none select-none": !isOpen,
            }
          )}
        >
          Review
        </Heading>
      </div>
      {isOpen && previousStepsCompleted && (
        <>
          <div className="flex items-start gap-x-1 w-full mb-6">
            <div className="w-full">
              <Text className="txt-medium-plus text-ui-fg-base mb-1">
                {isServiceOnlyCart(cart)
                  ? `By confirming, you accept our Terms of Use and booking terms and acknowledge that you have read ${SHOP_NAME}'s Privacy Policy.`
                  : `By clicking the Place Order button, you confirm that you have read, understand and accept our Terms of Use, Terms of Sale and Returns Policy and acknowledge that you have read ${SHOP_NAME}'s Privacy Policy.`}
              </Text>
            </div>
          </div>
          <PaymentButton cart={cart} data-testid="submit-order-button" />
        </>
      )}
    </div>
  )
}

export default Review
