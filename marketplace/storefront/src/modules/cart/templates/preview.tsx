"use client"

import repeat from "@lib/util/repeat"
import { HttpTypes } from "@medusajs/types"
import { Table, clx } from "@modules/common/components/ui"

import Item from "@modules/cart/components/item"
import SkeletonLineItem from "@modules/skeletons/components/skeleton-line-item"
import VendorGroupRow from "@modules/common/components/vendor-group-row"
import { groupByVendor, type VendorRef } from "@lib/util/group-by-vendor"
import { Fragment } from "react"

type ItemsTemplateProps = {
  cart: HttpTypes.StoreCart
  vendors?: Record<string, VendorRef>
}

const ItemsPreviewTemplate = ({ cart, vendors = {} }: ItemsTemplateProps) => {
  const items = cart.items
  const hasOverflow = items && items.length > 4

  return (
    <div
      className={clx({
        "pl-[1px] overflow-y-scroll overflow-x-hidden no-scrollbar max-h-[420px]":
          hasOverflow,
      })}
    >
      <Table>
        <Table.Body data-testid="items-table">
          {items
            ? groupByVendor(
                [...items].sort((a, b) =>
                  (a.created_at ?? "") > (b.created_at ?? "") ? -1 : 1
                ),
                vendors
              ).map((group) => (
                <Fragment key={group.vendor?.handle ?? "other"}>
                  {Object.keys(vendors).length > 0 && (
                    <VendorGroupRow vendor={group.vendor} colSpan={5} />
                  )}
                  {group.items.map((item) => (
                    <Item
                      key={item.id}
                      item={item}
                      type="preview"
                      currencyCode={cart.currency_code}
                    />
                  ))}
                </Fragment>
              ))
            : repeat(5).map((i) => {
                return <SkeletonLineItem key={i} />
              })}
        </Table.Body>
      </Table>
    </div>
  )
}

export default ItemsPreviewTemplate
