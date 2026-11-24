import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Input, Select, Table, Text, toast, usePrompt } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { adminLink, errorText, money, STATUS_COLOR } from "../../lib/marketplace"
import { sdk } from "../../lib/sdk"

const PAGE_SIZE = 50

// Vendor payouts (TASKS P6-07, BUILD_PLAN §9.6): the manual payout report.
// Each month's job makes one payout per vendor and currency (P6-06); pay it
// outside Medusa, then record the transfer's reference here. Reads
// GET /admin/vendor-payouts[/:id]; writes POST /admin/vendor-payouts/:id/pay.

type Payout = {
  id: string
  amount: number
  currency_code: string
  period: string
  status: string
  paid_at: string | null
  reference: string | null
  vendor: { id: string; name: string }
}
type Commission = {
  id: string
  order_id: string
  order_total: number
  rate: number
  amount: number
  payout_amount: number
  currency_code: string
  status: string
}

const PayoutDetail = ({ id }: { id: string }) => {
  const { data, isLoading } = useQuery({
    queryKey: ["marketplace-vendor-payout", id],
    queryFn: () =>
      sdk.client.fetch<{ vendor_payout: Payout & { commissions: Commission[] } }>(
        `/admin/vendor-payouts/${id}`
      ),
  })
  if (isLoading || !data) {
    return <Text size="small">Loading…</Text>
  }
  return (
    <div className="flex flex-col gap-y-1 py-2">
      {data.vendor_payout.commissions.map((c) => (
        <Text size="small" key={c.id}>
          <a href={adminLink(`/orders/${c.order_id}`)} className="text-ui-fg-interactive hover:underline">
            Order
          </a>{" "}
          total {money(c.order_total, c.currency_code)} − commission {money(c.amount, c.currency_code)} ({c.rate}%)
          = {money(c.payout_amount, c.currency_code)}
        </Text>
      ))}
    </div>
  )
}

type HeldCommission = Commission & {
  vendor: { id: string; name: string }
  order: { id: string; display_id: number } | null
  parent_order: { id: string; display_id: number; captured: number; refunded: number } | null
}

// Refunds to review (owner, F-078): a commission whose customer order has a
// refund is held out of payouts until it's settled here. Keep: the vendor
// gets it as it is; Reduce: the vendor gets the amount you enter; Pay nothing:
// nothing for this order. Kept or reduced, the next payout includes it. Each
// one is final, so it asks first and names the vendor and amount (design
// critique, 2026-11-23).
const RefundsToReview = () => {
  const queryClient = useQueryClient()
  const [amounts, setAmounts] = useState<Record<string, string>>({})
  const { data } = useQuery({
    queryKey: ["marketplace-refunds-to-review"],
    queryFn: () =>
      sdk.client.fetch<{ vendor_commissions: HeldCommission[] }>("/admin/vendor-commissions", {
        query: { refund_review: "to_review" },
      }),
  })
  const prompt = usePrompt()
  const settle = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown>; done: string }) =>
      sdk.client.fetch(`/admin/vendor-commissions/${id}/settle`, { method: "POST", body }),
    onSuccess: (_, { done }) => {
      toast.success(done)
      queryClient.invalidateQueries({ queryKey: ["marketplace-refunds-to-review"] })
    },
    onError: (e) => toast.error(errorText(e)),
  })
  const busyId = settle.isPending ? settle.variables?.id : undefined
  const decide = async (c: HeldCommission, action: "keep" | "reduce" | "cancel") => {
    const order = c.order ? ` #${c.order.display_id}` : ""
    const amount = action === "reduce" ? Number(amounts[c.id]) : action === "keep" ? c.payout_amount : 0
    const gets = money(amount, c.currency_code)
    const ok = await prompt({
      title: action === "cancel" ? `Pay ${c.vendor.name} nothing for order${order}?` : `Pay ${c.vendor.name} ${gets} for order${order}?`,
      description:
        action === "cancel"
          ? "The vendor gets nothing for this order. This can't be undone."
          : `The next payout includes ${gets} for this order. This can't be undone.`,
      variant: action === "cancel" ? "danger" : "confirmation",
      confirmText: action === "cancel" ? "Pay nothing" : `Pay ${gets}`,
      cancelText: "Back",
    })
    if (!ok) return
    settle.mutate({
      id: c.id,
      body: action === "reduce" ? { action, payout_amount: amount } : { action },
      done: action === "cancel" ? `${c.vendor.name} gets nothing for order${order}` : `${c.vendor.name} gets ${gets} for order${order}`,
    })
  }
  const validAmount = (c: HeldCommission) => {
    const raw = amounts[c.id]?.trim()
    const n = Number(raw)
    return !!raw && Number.isFinite(n) && n >= 0 && n < c.payout_amount
  }
  const held = data?.vendor_commissions ?? []
  if (!held.length) {
    return null
  }
  return (
    <Container className="flex flex-col gap-y-3">
      <div>
        <Heading level="h2">Refunds to review</Heading>
        <Text className="text-ui-fg-subtle">
          The customer got money back on these orders. They're held out of payouts until you decide
          what the vendor gets.
        </Text>
      </div>
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>Vendor order</Table.HeaderCell>
            <Table.HeaderCell>Customer order</Table.HeaderCell>
            <Table.HeaderCell>Vendor gets</Table.HeaderCell>
            <Table.HeaderCell />
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {held.map((c) => (
            <Table.Row key={c.id}>
              <Table.Cell>
                {c.vendor.name}
                {c.order && (
                  <>
                    {" · "}
                    <a href={adminLink(`/orders/${c.order.id}`)} className="text-ui-fg-interactive hover:underline">
                      #{c.order.display_id}
                    </a>
                  </>
                )}
              </Table.Cell>
              <Table.Cell>
                {c.parent_order && (
                  <>
                    <a href={adminLink(`/orders/${c.parent_order.id}`)} className="text-ui-fg-interactive hover:underline">
                      #{c.parent_order.display_id}
                    </a>{" "}
                    paid {money(c.parent_order.captured, c.currency_code)}, refunded{" "}
                    {money(c.parent_order.refunded, c.currency_code)}
                  </>
                )}
              </Table.Cell>
              <Table.Cell>{money(c.payout_amount, c.currency_code)}</Table.Cell>
              <Table.Cell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <Button
                    size="small"
                    variant="secondary"
                    disabled={!!busyId}
                    isLoading={busyId === c.id && settle.variables?.body.action === "keep"}
                    onClick={() => decide(c, "keep")}
                  >
                    Keep
                  </Button>
                  <Input
                    size="small"
                    type="number"
                    min={0}
                    step="0.01"
                    className="w-28"
                    placeholder="New amount"
                    aria-label={`New amount for ${c.vendor.name}`}
                    value={amounts[c.id] ?? ""}
                    onChange={(e) => setAmounts((a) => ({ ...a, [c.id]: e.target.value }))}
                  />
                  <Button
                    size="small"
                    variant="secondary"
                    disabled={!!busyId || !validAmount(c)}
                    isLoading={busyId === c.id && settle.variables?.body.action === "reduce"}
                    onClick={() => decide(c, "reduce")}
                  >
                    Reduce
                  </Button>
                  <Button
                    size="small"
                    variant="danger"
                    disabled={!!busyId}
                    isLoading={busyId === c.id && settle.variables?.body.action === "cancel"}
                    onClick={() => decide(c, "cancel")}
                  >
                    Pay nothing
                  </Button>
                </div>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    </Container>
  )
}

const VendorPayoutsPage = () => {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState("pending")
  // A page at a time (design critique, 2026-11-23); back to the first page
  // when the filter changes.
  const [page, setPage] = useState(0)
  useEffect(() => setPage(0), [status])
  const [open, setOpen] = useState<string | null>(null)
  const [references, setReferences] = useState<Record<string, string>>({})

  const { data, isLoading, error } = useQuery({
    queryKey: ["marketplace-vendor-payouts", status, page],
    queryFn: () =>
      sdk.client.fetch<{ vendor_payouts: Payout[]; count: number }>("/admin/vendor-payouts", {
        query: { ...(status === "all" ? {} : { status }), limit: PAGE_SIZE, offset: page * PAGE_SIZE },
      }),
  })
  const prompt = usePrompt()
  const pay = useMutation({
    mutationFn: ({ id, reference }: { id: string; reference: string; done: string }) =>
      sdk.client.fetch(`/admin/vendor-payouts/${id}/pay`, { method: "POST", body: { reference } }),
    onSuccess: (_, { done }) => {
      toast.success(done)
      queryClient.invalidateQueries({ queryKey: ["marketplace-vendor-payouts"] })
    },
    onError: (e) => toast.error(errorText(e)),
  })
  const markPaid = async (p: Payout) => {
    const reference = references[p.id].trim()
    const amount = money(p.amount, p.currency_code)
    const ok = await prompt({
      title: `Record ${amount} paid to ${p.vendor.name}?`,
      description: `For ${p.period}, transfer reference "${reference}". Check the reference: this can't be undone.`,
      variant: "confirmation",
      confirmText: "Record payment",
      cancelText: "Back",
    })
    if (ok) pay.mutate({ id: p.id, reference, done: `${amount} to ${p.vendor.name} recorded as paid` })
  }
  // Cancel a payout made by mistake (gap review 2026-11-24).
  const cancelPayout = useMutation({
    mutationFn: (p: Payout) => sdk.client.fetch(`/admin/vendor-payouts/${p.id}/cancel`, { method: "POST" }),
    onSuccess: (_, p) => {
      toast.success(`Payout to ${p.vendor.name} cancelled. Its sales go into the next payout.`)
      queryClient.invalidateQueries({ queryKey: ["marketplace-vendor-payouts"] })
    },
    onError: (e) => toast.error(errorText(e)),
  })
  const cancel = async (p: Payout) => {
    const ok = await prompt({
      title: `Cancel the ${money(p.amount, p.currency_code)} payout to ${p.vendor.name}?`,
      description: `Only if you haven't paid it. Its sales go back to waiting and are included in the next period's payout.`,
      variant: "danger",
      confirmText: "Cancel payout",
      cancelText: "Keep it",
    })
    if (ok) cancelPayout.mutate(p)
  }

  return (
    <div className="flex flex-col gap-y-3">
    <RefundsToReview />
    <Container className="flex flex-col gap-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <Heading>Vendor payouts</Heading>
          <Text className="text-ui-fg-subtle">
            Made once a month for the month before: each vendor's order totals minus commission.
            Pay by bank transfer, then record the transfer's reference here.
          </Text>
        </div>
        <Select value={status} onValueChange={setStatus}>
          <Select.Trigger className="w-36"><Select.Value /></Select.Trigger>
          <Select.Content>
            <Select.Item value="pending">To pay</Select.Item>
            <Select.Item value="paid">Paid</Select.Item>
            <Select.Item value="cancelled">Cancelled</Select.Item>
            <Select.Item value="all">All</Select.Item>
          </Select.Content>
        </Select>
      </div>
      {error && <Text className="text-ui-fg-error">{errorText(error)}</Text>}
      {isLoading ? (
        <Text>Loading…</Text>
      ) : !data?.vendor_payouts.length ? (
        <Text className="text-ui-fg-subtle">No payouts here.</Text>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Vendor</Table.HeaderCell>
              <Table.HeaderCell>Month</Table.HeaderCell>
              <Table.HeaderCell>Amount</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {data.vendor_payouts.map((p) => (
              <Table.Row key={p.id}>
                <Table.Cell>
                  <button
                    className="text-ui-fg-interactive hover:underline"
                    aria-expanded={open === p.id}
                    onClick={() => setOpen(open === p.id ? null : p.id)}
                  >
                    {open === p.id ? "▾" : "▸"} {p.vendor.name}
                  </button>
                  {open === p.id && <PayoutDetail id={p.id} />}
                </Table.Cell>
                <Table.Cell>{p.period}</Table.Cell>
                <Table.Cell>{money(p.amount, p.currency_code)}</Table.Cell>
                <Table.Cell>
                  <Badge size="2xsmall" color={STATUS_COLOR[p.status]}>{({ pending: "To pay", paid: "Paid", cancelled: "Cancelled" } as Record<string, string>)[p.status] ?? p.status}</Badge>
                  {p.reference && <Text size="small" className="text-ui-fg-subtle">{p.reference}</Text>}
                </Table.Cell>
                <Table.Cell className="text-right">
                  {p.status === "pending" && (
                    <div className="flex items-center justify-end gap-2">
                      <Input
                        size="small"
                        className="w-40"
                        placeholder="Transfer reference"
                        aria-label={`Transfer reference for ${p.vendor.name}`}
                        value={references[p.id] ?? ""}
                        onChange={(e) => setReferences((r) => ({ ...r, [p.id]: e.target.value }))}
                      />
                      <Button
                        size="small"
                        disabled={!references[p.id]?.trim() || pay.isPending}
                        isLoading={pay.isPending && pay.variables?.id === p.id}
                        onClick={() => markPaid(p)}
                      >
                        Mark paid
                      </Button>
                      <Button
                        size="small"
                        variant="secondary"
                        disabled={pay.isPending || cancelPayout.isPending}
                        isLoading={cancelPayout.isPending && cancelPayout.variables?.id === p.id}
                        onClick={() => cancel(p)}
                      >
                        Cancel
                      </Button>
                    </div>
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
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Vendor payouts",
})

export default VendorPayoutsPage
