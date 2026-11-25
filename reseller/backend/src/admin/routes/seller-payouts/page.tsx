import { defineRouteConfig } from "@medusajs/admin-sdk"
import { CurrencyDollar } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Input, Table, Text, toast, usePrompt } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { sdk } from "../../lib/sdk"
import { errorText, money } from "../../lib/ui"

// Seller payouts (TASKS P5-05; gap review 2026-11-24; owner 2026-11-25): what
// each seller is owed now (approved commissions less open clawbacks) and next
// (pending), "Approve now" / "Hold" per seller, "Mark paid" with the bank/ABA
// reference after the shop has paid outside Medusa, and the payout history.
// Reads GET /admin/seller-payouts; writes POST /admin/sellers/:id/payouts,
// /payouts/approve and POST /admin/sellers/:id { payout_hold }.

type SellerName = { handle: string; name: string; payout_hold?: boolean } | null
type Line = {
  seller_id: string
  currency_code: string
  amount: number
  count: number
  adjustment?: number
  net?: number
  seller: SellerName
}
type HistoryLine = {
  id: string
  seller_id: string
  currency_code: string
  amount: number
  commission_total: number
  adjustment_total: number
  commission_count: number
  reference: string | null
  paid_at: string
  seller: SellerName
}
type Report = {
  due: Line[]
  pending: Line[]
  adjustments: Line[]
  history: HistoryLine[]
  next_payout_date: string
}

const KEY = ["reseller-seller-payouts"]
const keyOf = (l: { seller_id: string; currency_code: string }) => `${l.seller_id}:${l.currency_code}`
const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" })

function Section({ title, help, children }: { title: string; help: string; children: React.ReactNode }) {
  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">{title}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {help}
        </Text>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </Container>
  )
}

const Empty = () => <Text className="px-6 py-4 text-ui-fg-subtle">Nothing here.</Text>

const SellerPayoutsPage = () => {
  const queryClient = useQueryClient()
  const prompt = usePrompt()
  const [refs, setRefs] = useState<Record<string, string>>({})
  const { data, isLoading, error } = useQuery({
    queryKey: KEY,
    queryFn: () => sdk.client.fetch<Report>("/admin/seller-payouts"),
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: KEY })

  const pay = useMutation({
    mutationFn: (l: Line) =>
      sdk.client.fetch(`/admin/sellers/${l.seller_id}/payouts`, {
        method: "POST",
        body: { currency_code: l.currency_code, reference: refs[keyOf(l)]?.trim() || null },
      }),
    onSuccess: (_, l) => {
      toast.success(`Recorded ${money(l.net ?? l.amount, l.currency_code)} paid to ${l.seller?.name ?? "the seller"}.`)
      setRefs((r) => ({ ...r, [keyOf(l)]: "" }))
      refresh()
    },
    onError: (e) => toast.error(errorText(e)),
  })
  const approve = useMutation({
    mutationFn: (l: Line) => sdk.client.fetch<{ approved: number }>(`/admin/sellers/${l.seller_id}/payouts/approve`, { method: "POST" }),
    onSuccess: (r, l) => {
      toast.success(`Approved ${r.approved} commissions of ${l.seller?.name ?? "the seller"}. They are in “To pay now”.`)
      refresh()
    },
    onError: (e) => toast.error(errorText(e)),
  })
  const hold = useMutation({
    mutationFn: ({ seller_id, payout_hold }: { seller_id: string; payout_hold: boolean }) =>
      sdk.client.fetch(`/admin/sellers/${seller_id}`, { method: "POST", body: { payout_hold } }),
    onSuccess: (_, v) => {
      toast.success(v.payout_hold ? "Payouts held. The payout day skips this seller." : "Hold lifted.")
      refresh()
      queryClient.invalidateQueries({ queryKey: ["reseller-sellers"] })
    },
    onError: (e) => toast.error(errorText(e)),
  })

  const markPaid = async (l: Line) => {
    const net = l.net ?? l.amount
    const ref = refs[keyOf(l)]?.trim()
    const ok = await prompt({
      title: "Record this payout?",
      description:
        `Only after you have paid ${l.seller?.name ?? "this seller"} ${money(net, l.currency_code)} (${l.count} sales` +
        (l.adjustment ? `, ${money(l.adjustment, l.currency_code)} clawed back` : "") +
        `). Reference: ${ref || "none"}.`,
      confirmText: "Yes, mark paid",
      cancelText: "Not yet",
    })
    if (ok) pay.mutate(l)
  }
  const busy = pay.isPending || approve.isPending || hold.isPending

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Heading>Seller payouts</Heading>
        {data && (
          <Text size="small" className="text-ui-fg-subtle" data-testid="next-payout-date">
            Next payout day: <strong>{date(data.next_payout_date)}</strong>
          </Text>
        )}
      </div>
      {isLoading && <Text className="text-ui-fg-subtle">Loading…</Text>}
      {error && <Text className="text-ui-fg-error">{errorText(error)}</Text>}
      {data && (
        <>
          <Section
            title="To pay now"
            help="Approved commissions, less clawbacks of refunded orders already paid out. Pay the seller first (bank, ABA, cash), add the transaction id, then mark it paid."
          >
            {data.due.length ? (
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Seller</Table.HeaderCell>
                    <Table.HeaderCell>Sales</Table.HeaderCell>
                    <Table.HeaderCell className="text-right">Commissions</Table.HeaderCell>
                    <Table.HeaderCell className="text-right">Clawbacks</Table.HeaderCell>
                    <Table.HeaderCell className="text-right">To pay</Table.HeaderCell>
                    <Table.HeaderCell>Reference</Table.HeaderCell>
                    <Table.HeaderCell />
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {data.due.map((l) => (
                    <Table.Row key={keyOf(l)}>
                      <Table.Cell>{l.seller?.name ?? l.seller_id}</Table.Cell>
                      <Table.Cell>{l.count}</Table.Cell>
                      <Table.Cell className="text-right">{money(l.amount, l.currency_code)}</Table.Cell>
                      <Table.Cell className="text-right">{l.adjustment ? money(l.adjustment, l.currency_code) : "—"}</Table.Cell>
                      <Table.Cell className="text-right font-medium">{money(l.net ?? l.amount, l.currency_code)}</Table.Cell>
                      <Table.Cell>
                        <Input
                          size="small"
                          placeholder="Bank / ABA transaction id"
                          aria-label={`Transaction id for ${l.seller?.name ?? l.seller_id}`}
                          maxLength={120}
                          value={refs[keyOf(l)] ?? ""}
                          onChange={(e) => setRefs((r) => ({ ...r, [keyOf(l)]: e.target.value }))}
                        />
                      </Table.Cell>
                      <Table.Cell className="text-right">
                        <Button
                          size="small"
                          disabled={busy || (l.net ?? l.amount) < 0}
                          isLoading={pay.isPending && pay.variables && keyOf(pay.variables) === keyOf(l)}
                          onClick={() => markPaid(l)}
                        >
                          Mark paid
                        </Button>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            ) : (
              <Empty />
            )}
          </Section>

          <Section
            title="Coming up"
            help="Commissions not approved yet. They move to “To pay now” on the next payout day, or now with “Approve now”. “Hold” keeps a seller out of the payout day."
          >
            {data.pending.length ? (
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Seller</Table.HeaderCell>
                    <Table.HeaderCell>Sales</Table.HeaderCell>
                    <Table.HeaderCell className="text-right">Amount</Table.HeaderCell>
                    <Table.HeaderCell />
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {data.pending.map((l) => {
                    const held = !!l.seller?.payout_hold
                    return (
                      <Table.Row key={keyOf(l)}>
                        <Table.Cell>
                          <span className="flex items-center gap-2">
                            {l.seller?.name ?? l.seller_id}
                            {held && <Badge size="2xsmall" color="orange">On hold</Badge>}
                          </span>
                        </Table.Cell>
                        <Table.Cell>{l.count}</Table.Cell>
                        <Table.Cell className="text-right">{money(l.amount, l.currency_code)}</Table.Cell>
                        <Table.Cell>
                          <div className="flex justify-end gap-2">
                            <Button size="small" variant="secondary" disabled={busy} onClick={() => approve.mutate(l)}>
                              Approve now
                            </Button>
                            <Button
                              size="small"
                              variant="transparent"
                              disabled={busy}
                              onClick={() => hold.mutate({ seller_id: l.seller_id, payout_hold: !held })}
                            >
                              {held ? "Release hold" : "Hold"}
                            </Button>
                          </div>
                        </Table.Cell>
                      </Table.Row>
                    )
                  })}
                </Table.Body>
              </Table>
            ) : (
              <Empty />
            )}
          </Section>

          {data.adjustments.length > 0 && (
            <Section
              title="Clawbacks waiting"
              help="Refunds or cancellations of orders whose commission was already paid out. They come off the seller's next payout."
            >
              <Table>
                <Table.Body>
                  {data.adjustments.map((l) => (
                    <Table.Row key={keyOf(l)}>
                      <Table.Cell>{l.seller?.name ?? l.seller_id}</Table.Cell>
                      <Table.Cell>{l.count} orders</Table.Cell>
                      <Table.Cell className="text-right">{money(l.amount, l.currency_code)}</Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            </Section>
          )}

          <Section title="Payout history" help="Payouts recorded with “Mark paid”, newest first. The seller sees the same list.">
            {data.history.length ? (
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Paid</Table.HeaderCell>
                    <Table.HeaderCell>Seller</Table.HeaderCell>
                    <Table.HeaderCell>Sales</Table.HeaderCell>
                    <Table.HeaderCell className="text-right">Amount</Table.HeaderCell>
                    <Table.HeaderCell>Reference</Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {data.history.map((p) => (
                    <Table.Row key={p.id}>
                      <Table.Cell>{date(p.paid_at)}</Table.Cell>
                      <Table.Cell>{p.seller?.name ?? p.seller_id}</Table.Cell>
                      <Table.Cell>{p.commission_count}</Table.Cell>
                      <Table.Cell className="text-right">
                        {money(p.amount, p.currency_code)}
                        {p.adjustment_total ? (
                          <Text size="xsmall" className="text-ui-fg-subtle">
                            {money(p.adjustment_total, p.currency_code)} clawed back
                          </Text>
                        ) : null}
                      </Table.Cell>
                      <Table.Cell className="font-mono text-xs">{p.reference ?? "—"}</Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            ) : (
              <Empty />
            )}
          </Section>
        </>
      )}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Seller payouts", icon: CurrencyDollar,
})

export default SellerPayoutsPage
