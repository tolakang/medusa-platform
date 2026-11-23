import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Input, Select, Table, Text, toast, usePrompt } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { errorText, STATUS_COLOR } from "../../lib/marketplace"
import { sdk } from "../../lib/sdk"

const PAGE_SIZE = 50

// Vendors (TASKS P6-07, BUILD_PLAN §9.6): the approval queue (pending first),
// approve / suspend / reactivate, and each vendor's commission rate. Reads
// GET /admin/vendors; writes POST /admin/vendors/:id (P6-03).

type Vendor = {
  id: string
  name: string
  handle: string
  email: string
  status: "pending" | "active" | "suspended"
  commission_rate: number | null
  created_at: string
  admins: { id: string; email: string; first_name: string | null; last_name: string | null }[]
}

const VendorsPage = () => {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState("pending")
  // A page at a time (design critique, 2026-11-23); back to the first page
  // when the filter changes.
  const [page, setPage] = useState(0)
  useEffect(() => setPage(0), [status])
  const [rates, setRates] = useState<Record<string, string>>({})

  const { data, isLoading, error } = useQuery({
    queryKey: ["marketplace-vendors", status, page],
    queryFn: () =>
      sdk.client.fetch<{ vendors: Vendor[]; count: number }>("/admin/vendors", {
        query: { ...(status === "all" ? {} : { status }), limit: PAGE_SIZE, offset: page * PAGE_SIZE },
      }),
  })
  const prompt = usePrompt()
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown>; done: string }) =>
      sdk.client.fetch(`/admin/vendors/${id}`, { method: "POST", body }),
    onSuccess: (_, { id, done }) => {
      toast.success(done)
      setRates(({ [id]: _saved, ...rest }) => rest)
      queryClient.invalidateQueries({ queryKey: ["marketplace-vendors"] })
    },
    onError: (e) => toast.error(errorText(e)),
  })
  const busyId = update.isPending ? update.variables?.id : undefined
  // A one-time "set a new password" link to send by chat when the reset email
  // doesn't reach them (design critique, 2026-11-23).
  const resetLink = useMutation({
    mutationFn: ({ path }: { path: string; who: string }) =>
      sdk.client.fetch<{ link: string; expires_in_minutes: number }>(path, { method: "POST" }),
    onSuccess: async ({ link, expires_in_minutes }, { who }) => {
      const copied = await navigator.clipboard.writeText(link).then(
        () => true,
        () => false
      )
      toast.success(copied ? `Reset link for ${who} copied` : `Reset link for ${who}`, {
        description: copied ? `Send it to them. It works for ${expires_in_minutes} minutes.` : link,
        duration: copied ? 8000 : 60000,
      })
    },
    onError: (e) => toast.error(errorText(e)),
  })
  // Suspending closes the vendor's shop and signs them out, so it asks first.
  const suspend = async (v: Vendor) => {
    const ok = await prompt({
      title: `Suspend ${v.name}?`,
      description: "Their products stop selling and their team is signed out of the vendor portal. You can reactivate them later.",
      variant: "danger",
      confirmText: "Suspend",
      cancelText: "Back",
    })
    if (ok) update.mutate({ id: v.id, body: { status: "suspended" }, done: `${v.name} suspended` })
  }
  /** "" = the marketplace default; otherwise 0 to 100. */
  const rateValue = (raw: string) => {
    const t = raw.trim()
    if (t === "") return null
    const n = Number(t)
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : undefined
  }

  return (
    <Container className="flex flex-col gap-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <Heading>Vendors</Heading>
          <Text className="text-ui-fg-subtle">
            New vendors wait here until you approve them. Commission is a percentage from 0 to 100;
            leave it empty to use the marketplace's default rate.
          </Text>
        </div>
        <Select value={status} onValueChange={setStatus}>
          <Select.Trigger className="w-44"><Select.Value /></Select.Trigger>
          <Select.Content>
            <Select.Item value="pending">Waiting for approval</Select.Item>
            <Select.Item value="active">Active</Select.Item>
            <Select.Item value="suspended">Suspended</Select.Item>
            <Select.Item value="all">All</Select.Item>
          </Select.Content>
        </Select>
      </div>
      {error && <Text className="text-ui-fg-error">{errorText(error)}</Text>}
      {isLoading ? (
        <Text>Loading…</Text>
      ) : !data?.vendors.length ? (
        <Text className="text-ui-fg-subtle">No vendors here.</Text>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Vendor</Table.HeaderCell>
              <Table.HeaderCell>Sign-in</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell>Commission %</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {data.vendors.map((v) => (
              <Table.Row key={v.id}>
                <Table.Cell>
                  <div className="flex flex-col">
                    <Text size="small" weight="plus">{v.name}</Text>
                    <Text size="small" className="text-ui-fg-subtle">{v.email} · shop address: {v.handle}</Text>
                  </div>
                </Table.Cell>
                <Table.Cell>
                  <div className="flex flex-col gap-1">
                    {v.admins.map((a) => (
                      <div key={a.id} className="flex items-center gap-2">
                        <Text size="small">{a.email}</Text>
                        <Button
                          size="small"
                          variant="transparent"
                          disabled={resetLink.isPending}
                          isLoading={resetLink.isPending && resetLink.variables?.path.includes(a.id)}
                          onClick={() =>
                            resetLink.mutate({ path: `/admin/vendors/${v.id}/admins/${a.id}/reset-link`, who: a.email })
                          }
                        >
                          Reset link
                        </Button>
                      </div>
                    ))}
                  </div>
                </Table.Cell>
                <Table.Cell>
                  <Badge size="2xsmall" color={STATUS_COLOR[v.status]}>{v.status}</Badge>
                </Table.Cell>
                <Table.Cell>
                  <div className="flex items-center gap-2">
                    <Input
                      size="small"
                      type="number"
                      min={0}
                      max={100}
                      step="0.1"
                      className="w-24"
                      placeholder="default"
                      aria-label={`Commission % for ${v.name}`}
                      aria-invalid={rates[v.id] !== undefined && rateValue(rates[v.id]) === undefined}
                      value={rates[v.id] ?? (v.commission_rate === null ? "" : String(v.commission_rate))}
                      onChange={(e) => setRates((r) => ({ ...r, [v.id]: e.target.value }))}
                    />
                    {rates[v.id] !== undefined && (
                      <Button
                        size="small"
                        variant="secondary"
                        disabled={!!busyId || rateValue(rates[v.id]) === undefined}
                        isLoading={busyId === v.id && "commission_rate" in (update.variables?.body ?? {})}
                        onClick={() => {
                          const rate = rateValue(rates[v.id])
                          update.mutate({
                            id: v.id,
                            body: { commission_rate: rate },
                            done: `${v.name}: commission ${rate === null ? "set to the default" : `${rate}%`}`,
                          })
                        }}
                      >
                        Save
                      </Button>
                    )}
                  </div>
                </Table.Cell>
                <Table.Cell className="text-right">
                  {v.status !== "active" && (
                    <Button
                      size="small"
                      disabled={!!busyId}
                      isLoading={busyId === v.id && update.variables?.body.status === "active"}
                      onClick={() =>
                        update.mutate({ id: v.id, body: { status: "active" }, done: `${v.name} ${v.status === "pending" ? "approved" : "reactivated"}` })
                      }
                    >
                      {v.status === "pending" ? "Approve" : "Reactivate"}
                    </Button>
                  )}
                  {v.status !== "suspended" && (
                    <Button
                      size="small"
                      variant="danger"
                      className="ml-2"
                      disabled={!!busyId}
                      isLoading={busyId === v.id && update.variables?.body.status === "suspended"}
                      onClick={() => suspend(v)}
                    >
                      Suspend
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
  label: "Vendors",
})

export default VendorsPage
