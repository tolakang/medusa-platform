import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { Table } from "@modules/common/components/ui"
import type { VendorRef } from "@lib/util/group-by-vendor"

// A table row heading one vendor's items: "Sold by <shop>".
export default function VendorGroupRow({
  vendor,
  colSpan,
}: {
  vendor: VendorRef | null
  colSpan: number
}) {
  return (
    <Table.Row className="hover:bg-transparent">
      <Table.Cell
        colSpan={colSpan}
        className="!pl-0 pt-4 pb-2 txt-small-plus text-ui-fg-subtle"
        data-testid="vendor-group-heading"
      >
        {vendor ? (
          <>
            Sold by{" "}
            <LocalizedClientLink
              href={`/vendors/${vendor.handle}`}
              className="text-ui-fg-base underline"
            >
              {vendor.name}
            </LocalizedClientLink>
          </>
        ) : (
          "Other items"
        )}
      </Table.Cell>
    </Table.Row>
  )
}
