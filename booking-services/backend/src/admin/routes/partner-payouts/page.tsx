import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Input, Table, Text, toast, usePrompt } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { sdk } from "../../lib/sdk"

// Partner payouts (TASKS P3-33, plan §9.3 "Money"): the monthly payout report
// to pay from, marking a payout paid with its transfer reference, and
// commissions held for a refund to keep or cancel. Reads and writes
// /admin/booking/payouts and /admin/booking/commissions.

type Payout = {
  id: string
  amount: number
  currency_code: string
  period: string
  status: "pending" | "paid" | "cancelled"
  paid_at: string | null
  reference: string | null
  provider: { id: string; name: string; email: string; phone: string | null } | null
}
type Commission = {
  id: string
  booking_id: string
  order_id: string
  line_total: number
  amount: number
  payout_amount: number
  refunded_amount: number
  currency_code: string
  status: string
  provider: { name: string } | null
}

const money = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(Number(amount))
  } catch {
    return `${amount} ${currency.toUpperCase()}`
  }
}

const PartnerPayoutsPage = () => {
  const queryClient = useQueryClient()
  const [refs, setRefs] = useState<Record<string, string>>({})
  const payouts = useQuery({
    queryKey: ["booking-payouts"],
    queryFn: () => sdk.client.fetch<{ payouts: Payout[] }>("/admin/booking/payouts"),
  })
  const held = useQuery({
    queryKey: ["booking-commissions-held"],
    queryFn: () => sdk.client.fetch<{ commissions: Commission[] }>("/admin/booking/commissions", { query: { refund_review: "to_review" } }),
  })
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["booking-payouts"] })
    queryClient.invalidateQueries({ queryKey: ["booking-commissions-held"] })
  }
  const onError = (e: Error) => toast.error(e.message)

  const run = useMutation({
    mutationFn: () => sdk.client.fetch<{ period: string; created: number }>("/admin/booking/payouts/run", { method: "POST" }),
    onSuccess: (r) => {
      refresh()
      toast.success(r.created ? `${r.created} payouts made for ${r.period}` : `Nothing new to pay for ${r.period}`)
    },
    onError,
  })
  // Cancel a payout made by mistake (gap review 2026-11-24).
  const prompt = usePrompt()
  const cancelPayout = useMutation({
    mutationFn: (id: string) => sdk.client.fetch(`/admin/booking/payouts/${id}/cancel`, { method: "POST" }),
    onSuccess: () => {
      refresh()
      toast.success("Payout cancelled. Its bookings go into a later payout.")
    },
    onError,
  })
  const cancel = async (id: string, who: string) => {
    const ok = await prompt({
      title: `Cancel the payout to ${who}?`,
      description: "Only if you haven't paid it. Its bookings go back to waiting for a later payout.",
      variant: "danger",
      confirmText: "Cancel payout",
      cancelText: "Keep it",
    })
    if (ok) cancelPayout.mutate(id)
  }
  const pay = useMutation({
    mutationFn: ({ id, reference }: { id: string; reference: string }) =>
      sdk.client.fetch(`/admin/booking/payouts/${id}/pay`, { method: "POST", body: { reference } }),
    onSuccess: () => {
      refresh()
      toast.success("Payout marked paid")
    },
    onError,
  })
  const settle = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "keep" | "cancel" }) =>
      sdk.client.fetch(`/admin/booking/commissions/${id}/settle`, { method: "POST", body: { action } }),
    onSuccess: () => {
      refresh()
      toast.success("Commission settled")
    },
    onError,
  })

  const heldRows = held.data?.commissions ?? []
  const payoutRows = payouts.data?.payouts ?? []

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="divide-y p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
          <div>
            <Heading level="h1">Partner payouts</Heading>
            <Text size="small" className="text-ui-fg-subtle">
              Each month, every partner gets one payout per currency: their bookings minus the shop&apos;s commission.
              Pay it by bank transfer, then mark it paid with the transfer&apos;s reference. Staff bookings earn no
              commission.
            </Text>
          </div>
          <Button size="small" variant="secondary" isLoading={run.isPending} onClick={() => run.mutate()}>
            Make last month&apos;s payouts
          </Button>
        </div>
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Month</Table.HeaderCell>
              <Table.HeaderCell>Partner</Table.HeaderCell>
              <Table.HeaderCell>Amount</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {payoutRows.map((p) => (
              <Table.Row key={p.id}>
                <Table.Cell>{p.period}</Table.Cell>
                <Table.Cell>
                  {p.provider?.name}
                  <div className="text-ui-fg-subtle">{[p.provider?.email, p.provider?.phone].filter(Boolean).join(" · ")}</div>
                </Table.Cell>
                <Table.Cell>{money(p.amount, p.currency_code)}</Table.Cell>
                <Table.Cell>
                  <Badge size="2xsmall" color={p.status === "paid" ? "green" : p.status === "pending" ? "orange" : "grey"}>
                    {p.status === "paid" ? "Paid" : p.status === "pending" ? "To pay" : "Cancelled"}
                  </Badge>
                  {p.reference && <div className="text-ui-fg-subtle">{p.reference}</div>}
                </Table.Cell>
                <Table.Cell>
                  {p.status === "pending" && (
                    <div className="flex justify-end gap-x-2">
                      <Input
                        size="small"
                        placeholder="Transfer reference"
                        aria-label="Transfer reference"
                        value={refs[p.id] ?? ""}
                        onChange={(e) => setRefs({ ...refs, [p.id]: e.target.value })}
                      />
                      <Button
                        size="small"
                        disabled={!(refs[p.id] ?? "").trim() || pay.isPending}
                        onClick={() => pay.mutate({ id: p.id, reference: refs[p.id].trim() })}
                      >
                        Mark paid
                      </Button>
                      <Button
                        size="small"
                        variant="secondary"
                        disabled={pay.isPending || cancelPayout.isPending}
                        onClick={() => cancel(p.id, p.provider?.name ?? "this partner")}
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
        {!payouts.isLoading && !payoutRows.length && (
          <Text size="small" className="text-ui-fg-subtle px-6 py-4">
            No payouts yet. They are made on the payout day (BOOKING_PAYOUT_DAY) for the month before.
          </Text>
        )}
      </Container>

      <Container className="divide-y p-0">
        <div className="px-6 py-4">
          <Heading level="h2">Held for a refund</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            The order was refunded in a way its booking cancels don&apos;t explain, or after the commission was paid
            out. Keep it (the partner is paid as usual) or cancel it (nothing is owed for that booking).
          </Text>
        </div>
        {heldRows.length ? (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Partner</Table.HeaderCell>
                <Table.HeaderCell>Booking</Table.HeaderCell>
                <Table.HeaderCell>Owed</Table.HeaderCell>
                <Table.HeaderCell />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {heldRows.map((c) => (
                <Table.Row key={c.id}>
                  <Table.Cell>{c.provider?.name}</Table.Cell>
                  <Table.Cell>
                    <a className="text-ui-fg-interactive" href={`/app/orders/${c.order_id}`}>
                      Order
                    </a>{" "}
                    · {money(c.line_total, c.currency_code)}
                  </Table.Cell>
                  <Table.Cell>
                    {money(c.payout_amount, c.currency_code)} · {c.status}
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex justify-end gap-x-2">
                      <Button size="small" variant="secondary" disabled={settle.isPending} onClick={() => settle.mutate({ id: c.id, action: "keep" })}>
                        Keep
                      </Button>
                      <Button size="small" variant="secondary" disabled={settle.isPending} onClick={() => settle.mutate({ id: c.id, action: "cancel" })}>
                        Cancel
                      </Button>
                    </div>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        ) : (
          <Text size="small" className="text-ui-fg-subtle px-6 py-4">
            Nothing held.
          </Text>
        )}
      </Container>
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Partner payouts",
})

export default PartnerPayoutsPage
