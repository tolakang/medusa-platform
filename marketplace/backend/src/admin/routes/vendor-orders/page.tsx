import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ShoppingCart } from "@medusajs/icons"
import { Badge, Container, Heading, Table, Text } from "@medusajs/ui"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { adminLink, errorText, money, STATUS_COLOR, statusLabel } from "../../lib/marketplace"
import { sdk } from "../../lib/sdk"

const PAGE_SIZE = 50

// Vendor orders (TASKS P6-07, BUILD_PLAN §9.6): the child orders vendors
// fulfil, which reports count. Medusa's own Orders list shows the
// customers' parent orders (they hold the payment) and these together.
// Reads GET /admin/vendor-orders.

type VendorOrder = {
  id: string
  display_id: number
  status: string
  total: number
  currency_code: string
  created_at: string
  parent_order_id: string | null
  vendor: { id: string; name: string }
}

const VendorOrdersPage = () => {
  // A page at a time (design critique, 2026-11-23); back to the first page
  // when the filter changes.
  const [page, setPage] = useState(0)
  const { data, isLoading, error } = useQuery({
    queryKey: ["marketplace-vendor-orders", page],
    queryFn: () =>
      sdk.client.fetch<{ orders: VendorOrder[]; count: number }>("/admin/vendor-orders", {
        query: { limit: PAGE_SIZE, offset: page * PAGE_SIZE },
      }),
  })
  // The parent orders' numbers, so the link says which order it opens
  // (design critique, 2026-11-23). Medusa's own admin order list, by id.
  const parentIds = [
    ...new Set((data?.orders ?? []).map((o) => o.parent_order_id).filter((id): id is string => !!id)),
  ]
  const { data: parents } = useQuery({
    queryKey: ["marketplace-vendor-orders-parents", parentIds],
    queryFn: () =>
      sdk.admin.order.list({ id: parentIds, fields: "id,display_id", limit: parentIds.length }),
    enabled: parentIds.length > 0,
  })
  const parentNumber = new Map((parents?.orders ?? []).map((p) => [p.id, p.display_id]))

  return (
    <Container className="flex flex-col gap-y-4">
      <div>
        <Heading>Vendor orders</Heading>
        <Text className="text-ui-fg-subtle">
          One per vendor per checkout. The customer's payment is on the parent order.
        </Text>
      </div>
      {error && <Text className="text-ui-fg-error">{errorText(error)}</Text>}
      {isLoading ? (
        <Text>Loading…</Text>
      ) : !data?.orders.length ? (
        <Text className="text-ui-fg-subtle">
          No vendor orders yet. They appear here when a customer checks out with products from your{" "}
          <a href={adminLink("/vendors")} className="text-ui-fg-interactive hover:underline">
            vendors
          </a>
          .
        </Text>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Order</Table.HeaderCell>
              <Table.HeaderCell>Vendor</Table.HeaderCell>
              <Table.HeaderCell>Total</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell>Customer order</Table.HeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {data.orders.map((o) => (
              <Table.Row key={o.id}>
                <Table.Cell>
                  <a href={adminLink(`/orders/${o.id}`)} className="text-ui-fg-interactive hover:underline">
                    #{o.display_id}
                  </a>
                </Table.Cell>
                <Table.Cell>{o.vendor.name}</Table.Cell>
                <Table.Cell>{money(o.total, o.currency_code)}</Table.Cell>
                <Table.Cell>
                  <Badge size="2xsmall" color={STATUS_COLOR[o.status] ?? "grey"}>
                    {statusLabel(o.status)}
                  </Badge>
                </Table.Cell>
                <Table.Cell>
                  {o.parent_order_id && (
                    <a href={adminLink(`/orders/${o.parent_order_id}`)} className="text-ui-fg-interactive hover:underline">
                      {parentNumber.has(o.parent_order_id)
                        ? `#${parentNumber.get(o.parent_order_id)}`
                        : "Customer order"}
                    </a>
                  )}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
        {(data?.count ?? 0) > PAGE_SIZE && (
          <Table.Pagination
            count={data?.count ?? 0}
            pageSize={PAGE_SIZE}
            pageIndex={page}
            pageCount={Math.ceil((data?.count ?? 0) / PAGE_SIZE)}
            canPreviousPage={page > 0}
            canNextPage={(page + 1) * PAGE_SIZE < (data?.count ?? 0)}
            previousPage={() => setPage((p) => p - 1)}
            nextPage={() => setPage((p) => p + 1)}
          />
        )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Vendor orders", icon: ShoppingCart,
})

export default VendorOrdersPage
