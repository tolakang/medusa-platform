import repeat from "@lib/util/repeat"
import { HttpTypes } from "@medusajs/types"
import { Table } from "@modules/common/components/ui"

import Divider from "@modules/common/components/divider"
import Item from "@modules/order/components/item"
import SkeletonLineItem from "@modules/skeletons/components/skeleton-line-item"
import VendorGroupRow from "@modules/common/components/vendor-group-row"
import { groupByVendor, type VendorRef } from "@lib/util/group-by-vendor"
import { Fragment } from "react"

type ItemsProps = {
  order: HttpTypes.StoreOrder
  vendors?: Record<string, VendorRef>
}

const Items = ({ order, vendors = {} }: ItemsProps) => {
  const items = order.items

  return (
    <div className="flex flex-col">
      <Divider className="!mb-0" />
      <Table>
        <Table.Body data-testid="products-table">
          {items?.length
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
                      currencyCode={order.currency_code}
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

export default Items
