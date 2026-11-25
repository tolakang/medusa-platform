import repeat from "@lib/util/repeat"
import { HttpTypes } from "@medusajs/types"
import { Heading, Table } from "@modules/common/components/ui"

import Item from "@modules/cart/components/item"
import SkeletonLineItem from "@modules/skeletons/components/skeleton-line-item"
import VendorGroupRow from "@modules/common/components/vendor-group-row"
import { groupByVendor, type VendorRef } from "@lib/util/group-by-vendor"
import { Fragment } from "react"

type ItemsTemplateProps = {
  cart?: HttpTypes.StoreCart
  vendors?: Record<string, VendorRef>
}

const ItemsTemplate = ({ cart, vendors = {} }: ItemsTemplateProps) => {
  const items = cart?.items
  return (
    <div>
      <div className="pb-3 flex items-center">
        <Heading className="text-[2rem] leading-[2.75rem]">Cart</Heading>
      </div>
      <Table>
        <Table.Header className="border-t-0">
          <Table.Row className="text-ui-fg-subtle txt-medium-plus">
            <Table.HeaderCell className="!pl-0">Item</Table.HeaderCell>
            <Table.HeaderCell></Table.HeaderCell>
            <Table.HeaderCell className="hidden small:table-cell">
              Quantity
            </Table.HeaderCell>
            <Table.HeaderCell className="hidden small:table-cell">
              Price
            </Table.HeaderCell>
            <Table.HeaderCell className="!pr-0 text-right">
              Total
            </Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
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
                      currencyCode={cart?.currency_code}
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

export default ItemsTemplate
