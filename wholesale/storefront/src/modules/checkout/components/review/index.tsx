"use client"
import { SHOP_NAME } from "@/lib/shop"

import { Text } from "@medusajs/ui"

import { checkSpendingLimit } from "@/lib/util/check-spending-limit"
import PaymentButton from "@/modules/checkout/components/payment-button"
import Button from "@/modules/common/components/button"
import LocalizedClientLink from "@/modules/common/components/localized-client-link"
import { ApprovalStatusType, ApprovalType, B2BCart, B2BCustomer } from "@/types"
import { ExclamationCircle } from "@medusajs/icons"

const Review = ({
  cart,
  customer,
}: {
  cart: B2BCart
  customer: B2BCustomer | null
}) => {
  // A company admin's approval of this cart overrides the spending limit
  // (backend assertCartCanBePlaced).
  const approvedByAdmin = (cart.approvals ?? []).some(
    (approval) =>
      approval?.type === ApprovalType.ADMIN &&
      approval?.status === ApprovalStatusType.APPROVED
  )
  const spendLimitExceeded =
    customer && !approvedByAdmin ? checkSpendingLimit(cart, customer) : false

  return (
    <div className="flex flex-col gap-y-2">
      <div className="flex items-start gap-x-1 w-full">
        <Text className="txt-xsmall text-neutral-500 mb-1">
          By completing this order, I agree to {SHOP_NAME}&apos;s{" "}
          <LocalizedClientLink
            href="/terms"
            className="hover:text-neutral-800"
            target="_blank"
          >
            Terms of Sale ↗
          </LocalizedClientLink>{" "}
          and{" "}
          <LocalizedClientLink
            href="/privacy"
            className="hover:text-neutral-800"
            target="_blank"
          >
            Privacy Policy ↗
          </LocalizedClientLink>
        </Text>
      </div>
      {spendLimitExceeded ? (
        <>
          <div className="flex items-center gap-x-2 bg-neutral-100 p-3 rounded-md shadow-borders-base">
            <ExclamationCircle className="text-orange-500 w-fit overflow-visible" />
            <p className="text-neutral-950 text-xs">
              This order exceeds your spending limit.
              <br />
              Please contact your manager for approval.
            </p>
          </div>
          <Button className="w-full h-10 rounded-full shadow-none" disabled>
            Place Order
          </Button>
        </>
      ) : (
        <PaymentButton cart={cart} customer={customer} data-testid="submit-order-button" />
      )}
    </div>
  )
}

export default Review
