import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Select, Table, Text, toast, usePrompt } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { adminLink, errorText, STATUS_COLOR } from "../../lib/marketplace"
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
  const prompt = usePrompt()
  const review = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "publish" | "reject"; title: string }) =>
      sdk.client.fetch(`/admin/vendor-products/${id}/review`, { method: "POST", body: { action } }),
    onSuccess: (_, { action, title }) => {
      toast.success(`${title} ${action === "publish" ? "published" : "rejected"}`)
      queryClient.invalidateQueries({ queryKey: ["marketplace-vendor-products"] })
    },
    onError: (e) => toast.error(errorText(e)),
  })
  const busyId = review.isPending ? review.variables?.id : undefined
  const reject = async (p: VendorProduct) => {
    const ok = await prompt({
      title: `Reject ${p.title}?`,
      description: `${p.vendor.name} sees it as rejected and it doesn't sell. You can publish it later.`,
      variant: "danger",
      confirmText: "Reject",
      cancelText: "Back",
    })
    if (ok) review.mutate({ id: p.id, action: "reject", title: p.title })
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
                  <a href={adminLink(`/products/${p.id}`)} className="text-ui-fg-interactive hover:underline">
                    {p.title}
                  </a>
                </Table.Cell>
                <Table.Cell>
                  <Text size="small">{p.vendor.name}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Badge size="2xsmall" color={STATUS_COLOR[p.status]}>{p.status}</Badge>
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
                      Reject
                    </Button>
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
  label: "Product moderation",
})

export default VendorProductsPage
