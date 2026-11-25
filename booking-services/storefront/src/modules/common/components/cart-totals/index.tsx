"use client"

import { balanceWhere, depositSplit, isServiceOnlyCart, itemsPlace } from "@lib/util/booking"
import { convertToLocale } from "@lib/util/money"
import React from "react"

type CartTotalsProps = {
  totals: {
    total?: number | null
    subtotal?: number | null
    tax_total?: number | null
    currency_code: string
    item_subtotal?: number | null
    shipping_subtotal?: number | null
    discount_subtotal?: number | null
    items?: { requires_shipping?: boolean | null }[] | null
  }
}

const CartTotals: React.FC<CartTotalsProps> = ({ totals }) => {
  const {
    currency_code,
    total,
    tax_total,
    item_subtotal,
    shipping_subtotal,
    discount_subtotal,
  } = totals
  // Only booked services: nothing is shipped, so no shipping line (TASKS P3-19).
  const servicesOnly = isServiceOnlyCart(totals)
  // Deposit services (P3-26): what is paid now and what is left for the venue.
  const split = depositSplit((totals as { items?: never[] }).items)
  // On an order: its balance payment collection, once staff mark it paid.
  const balance = (totals as { payment_collections?: { status?: string; metadata?: Record<string, unknown> | null }[] })
    .payment_collections?.find((c) => c?.metadata?.booking_balance)
  const balancePaid = balance ? balance.status === "completed" : undefined

  return (
    <div>
      <div className="flex flex-col gap-y-2 txt-medium text-ui-fg-subtle ">
        <div className="flex items-center justify-between">
          <span>{servicesOnly ? "Subtotal (excl. taxes)" : "Subtotal (excl. shipping and taxes)"}</span>
          <span data-testid="cart-subtotal" data-value={item_subtotal || 0}>
            {convertToLocale({ amount: item_subtotal ?? 0, currency_code })}
          </span>
        </div>
        {!servicesOnly && (
          <div className="flex items-center justify-between">
            <span>Shipping</span>
            <span data-testid="cart-shipping" data-value={shipping_subtotal || 0}>
              {convertToLocale({ amount: shipping_subtotal ?? 0, currency_code })}
            </span>
          </div>
        )}
        {!!discount_subtotal && (
          <div className="flex items-center justify-between">
            <span>Discount</span>
            <span
              className="text-ui-fg-interactive"
              data-testid="cart-discount"
              data-value={discount_subtotal || 0}
            >
              -{" "}
              {convertToLocale({
                amount: discount_subtotal ?? 0,
                currency_code,
              })}
            </span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="flex gap-x-1 items-center ">Taxes</span>
          <span data-testid="cart-taxes" data-value={tax_total || 0}>
            {convertToLocale({ amount: tax_total ?? 0, currency_code })}
          </span>
        </div>
      </div>
      <div className="h-px w-full border-b border-gray-200 my-4" />
      <div className="flex items-center justify-between text-ui-fg-base mb-2 txt-medium ">
        <span>Total</span>
        <span
          className="txt-xlarge-plus"
          data-testid="cart-total"
          data-value={total || 0}
        >
          {convertToLocale({ amount: total ?? 0, currency_code })}
        </span>
      </div>
      {split && (
        <div className="flex flex-col gap-y-1 txt-small text-ui-fg-subtle" data-testid="deposit-split">
          <div className="flex items-center justify-between">
            <span>{balancePaid === undefined ? "Pay now (deposit)" : "Paid (deposit)"}</span>
            <span>{convertToLocale({ amount: split.now, currency_code })}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>{balancePaid ? "Balance paid" : split.plan ? "Later payments (plan)" : `Balance ${balanceWhere(itemsPlace((totals as { items?: never[] }).items))}`}</span>
            <span>{convertToLocale({ amount: split.later, currency_code })}</span>
          </div>
        </div>
      )}
      <div className="h-px w-full border-b border-gray-200 mt-4" />
    </div>
  )
}

export default CartTotals
