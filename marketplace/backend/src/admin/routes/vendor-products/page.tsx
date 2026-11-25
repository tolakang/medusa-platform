import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Tag } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Input, Select, Table, Text, toast } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { adminLink, errorText, money, STATUS_COLOR, statusLabel } from "../../lib/marketplace"
import { sdk } from "../../lib/sdk"

const PAGE_SIZE = 50

// Product moderation (TASKS P6-07, BUILD_PLAN §9.6): vendors' products, the
// ones waiting for review first; publish or reject. Reads
// GET /admin/vendor-products; writes POST /admin/vendor-products/:id/review.

type VendorProduct = {
  id: string
  title: string
  handle: string
  status: string
  thumbnail: string | null
  description?: string | null
  variants?: { prices?: { amount: number; currency_code: string }[] }[]
  created_at: string
  vendor: { id: string; name: string; status: string }
}

const VendorProductsPage = () => {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState("proposed")
  // A page at a time (design critique, 2026-11-23); back to the first page
  // when the filter changes.
  const [page, setPage] = useState(0)
  useEffect(() => setPage(0), [status])

  const { data, isLoading, error } = useQuery({
    queryKey: ["marketplace-vendor-products", status, page],
    queryFn: () =>
      sdk.client.fetch<{ products: VendorProduct[]; count: number }>("/admin/vendor-products", {
        query: { ...(status === "all" ? {} : { status }), limit: PAGE_SIZE, offset: page * PAGE_SIZE },
      }),
  })
  const review = useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: "publish" | "reject"; title: string; note?: string }) =>
      sdk.client.fetch(`/admin/vendor-products/${id}/review`, {
        method: "POST",
        body: { action, ...(note?.trim() ? { note: note.trim() } : {}) },
      }),
    onSuccess: (_, { action, title }) => {
      toast.success(`${title} ${action === "publish" ? "published" : "rejected"}`)
      queryClient.invalidateQueries({ queryKey: ["marketplace-vendor-products"] })
    },
    onError: (e) => toast.error(errorText(e)),
  })
  const busyId = review.isPending ? review.variables?.id : undefined
  // Reject with a reason the vendor sees (gap review 2026-11-24).
  const [rejecting, setRejecting] = useState<{ id: string; note: string } | null>(null)
  // One confirmation (bug 2026-11-25): "Reject" opens the reason field,
  // "Reject now" sends it; the vendor can fix and resend, so no extra prompt.
  const reject = (p: VendorProduct) => {
    if (rejecting?.id !== p.id) {
      setRejecting({ id: p.id, note: "" })
      return
    }
    review.mutate({ id: p.id, action: "reject", title: p.title, note: rejecting.note })
    setRejecting(null)
  }

  return (
    <Container className="flex flex-col gap-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <Heading>Product moderation</Heading>
          <Text className="text-ui-fg-subtle">
            Vendors' products stay unpublished until you publish them here.
          </Text>
        </div>
        <Select value={status} onValueChange={setStatus}>
          <Select.Trigger className="w-44"><Select.Value /></Select.Trigger>
          <Select.Content>
            <Select.Item value="proposed">Waiting for review</Select.Item>
            <Select.Item value="draft">Drafts</Select.Item>
            <Select.Item value="published">Published</Select.Item>
            <Select.Item value="rejected">Rejected</Select.Item>
            <Select.Item value="all">All</Select.Item>
          </Select.Content>
        </Select>
      </div>
      {error && <Text className="text-ui-fg-error">{errorText(error)}</Text>}
      {isLoading ? (
        <Text>Loading…</Text>
      ) : !data?.products.length ? (
        <Text className="text-ui-fg-subtle">No products here.</Text>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Product</Table.HeaderCell>
              <Table.HeaderCell>Vendor</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {data.products.map((p) => (
              <Table.Row key={p.id}>
                <Table.Cell>
                  <div className="flex items-start gap-3 py-2">
                    {p.thumbnail ? (
                      <img src={p.thumbnail} alt="" className="h-12 w-12 rounded object-cover" />
                    ) : (
                      <div className="bg-ui-bg-subtle text-ui-fg-muted flex h-12 w-12 items-center justify-center rounded text-[10px]">
                        No image
                      </div>
                    )}
                    <div className="flex max-w-sm flex-col">
                      <a href={adminLink(`/products/${p.id}`)} className="text-ui-fg-interactive hover:underline">
                        {p.title}
                      </a>
                      <Text size="small" className="text-ui-fg-subtle">
                        {(() => {
                          const price = p.variants?.[0]?.prices?.[0]
                          return price ? money(price.amount, price.currency_code) : "No price"
                        })()}
                      </Text>
                      {p.description && (
                        <Text size="small" className="text-ui-fg-subtle line-clamp-2">
                          {p.description}
                        </Text>
                      )}
                    </div>
                  </div>
                </Table.Cell>
                <Table.Cell>
                  <Text size="small">{p.vendor.name}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Badge size="2xsmall" color={STATUS_COLOR[p.status]}>{statusLabel(p.status)}</Badge>
                </Table.Cell>
                <Table.Cell className="text-right">
                  {p.status !== "published" && (
                    <Button
                      size="small"
                      disabled={!!busyId}
                      isLoading={busyId === p.id && review.variables?.action === "publish"}
                      onClick={() => review.mutate({ id: p.id, action: "publish", title: p.title })}
                    >
                      Publish
                    </Button>
                  )}
                  {p.status !== "rejected" && (
                    <Button
                      size="small"
                      variant="danger"
                      className="ml-2"
                      disabled={!!busyId}
                      isLoading={busyId === p.id && review.variables?.action === "reject"}
                      onClick={() => reject(p)}
                    >
                      {rejecting?.id === p.id ? "Reject now" : "Reject"}
                    </Button>
                  )}
                  {rejecting?.id === p.id && (
                    <Input
                      size="small"
                      className="mt-2"
                      aria-label="Reason for rejecting (the vendor sees it)"
                      placeholder="Reason (the vendor sees it)"
                      maxLength={500}
                      value={rejecting.note}
                      onChange={(e) => setRejecting({ id: p.id, note: e.target.value })}
                      autoFocus
                    />
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
  label: "Product moderation", icon: Tag,
})

export default VendorProductsPage
