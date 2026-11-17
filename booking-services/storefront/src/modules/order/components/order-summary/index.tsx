import { depositSplit, isServiceOnlyCart } from "@lib/util/booking"
import { convertToLocale } from "@lib/util/money"
import { HttpTypes } from "@medusajs/types"

type OrderSummaryProps = {
  order: HttpTypes.StoreOrder
}

const OrderSummary = ({ order }: OrderSummaryProps) => {
  const getAmount = (amount?: number | null) => {
    if (!amount) {
      return
    }

    return convertToLocale({
      amount,
      currency_code: order.currency_code,
    })
  }

  // Deposit services (P3-26).
  const split = depositSplit(order.items as never)
  const balancePaid =
    (order as { payment_collections?: { status?: string; metadata?: Record<string, unknown> | null }[] }).payment_collections?.find(
      (c) => c?.metadata?.booking_balance
    )?.status === "completed"

  return (
    <div>
      <h2 className="text-base-semi">Order Summary</h2>
      <div className="text-small-regular text-ui-fg-base my-2">
        <div className="flex items-center justify-between text-base-regular text-ui-fg-base mb-2">
          <span>Subtotal</span>
          <span>{getAmount(order.subtotal)}</span>
        </div>
        <div className="flex flex-col gap-y-1">
          {order.discount_total > 0 && (
            <div className="flex items-center justify-between">
              <span>Discount</span>
              <span>- {getAmount(order.discount_total)}</span>
            </div>
          )}
          {order.gift_card_total > 0 && (
            <div className="flex items-center justify-between">
              <span>Discount</span>
              <span>- {getAmount(order.gift_card_total)}</span>
            </div>
          )}
          {/* Only booked services: nothing shipped (TASKS P3-19). */}
          {!isServiceOnlyCart(order) && (
            <div className="flex items-center justify-between">
              <span>Shipping</span>
              <span>{getAmount(order.shipping_total)}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span>Taxes</span>
            <span>{getAmount(order.tax_total)}</span>
          </div>
        </div>
        <div className="h-px w-full border-b border-gray-200 border-dashed my-4" />
        <div className="flex items-center justify-between text-base-regular text-ui-fg-base mb-2">
          <span>Total</span>
          <span>{getAmount(order.total)}</span>
        </div>
        {split && (
          <div className="flex flex-col gap-y-1 txt-small text-ui-fg-subtle" data-testid="deposit-split">
            <div className="flex items-center justify-between">
              <span>Paid (deposit)</span>
              <span>{getAmount(split.now)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>{balancePaid ? "Balance paid" : "Balance at the venue"}</span>
              <span>{getAmount(split.later)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default OrderSummary
