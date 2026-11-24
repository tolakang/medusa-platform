import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Button, Container, Heading, Table, Text, toast, usePrompt } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { sdk } from "../../lib/sdk"

// Seller payouts (TASKS P5-05; gap review 2026-11-24): what each seller is
// owed now (approved commissions) and next (pending), and "Mark paid" after
// the shop has paid them outside Medusa. Reads GET /admin/seller-payouts;
// writes POST /admin/sellers/:id/payouts.

type Line = {
  seller_id: string
  currency_code: string
  amount: number
  count: number
  seller: { handle: string; name: string } | null
}

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: currency.toUpperCase() }).format(amount)

const errorText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Try again.")

function Lines({ title, help, lines, action }: { title: string; help: string; lines: Line[]; action?: (l: Line) => React.ReactNode }) {
  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">{title}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {help}
        </Text>
      </div>
      {lines.length ? (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Seller</Table.HeaderCell>
              <Table.HeaderCell>Sales</Table.HeaderCell>
              <Table.HeaderCell className="text-right">Amount</Table.HeaderCell>
              {action && <Table.HeaderCell />}
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {lines.map((l) => (
              <Table.Row key={`${l.seller_id}:${l.currency_code}`}>
                <Table.Cell>{l.seller?.name ?? l.seller_id}</Table.Cell>
                <Table.Cell>{l.count}</Table.Cell>
                <Table.Cell className="text-right">{money(l.amount, l.currency_code)}</Table.Cell>
                {action && <Table.Cell className="text-right">{action(l)}</Table.Cell>}
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      ) : (
        <Text className="px-6 py-4 text-ui-fg-subtle">Nothing here.</Text>
      )}
    </Container>
  )
}

const SellerPayoutsPage = () => {
  const queryClient = useQueryClient()
  const prompt = usePrompt()
  const { data, isLoading, error } = useQuery({
    queryKey: ["reseller-seller-payouts"],
    queryFn: () => sdk.client.fetch<{ due: Line[]; pending: Line[] }>("/admin/seller-payouts"),
  })
  const pay = useMutation({
    mutationFn: (l: Line) =>
      sdk.client.fetch(`/admin/sellers/${l.seller_id}/payouts`, {
        method: "POST",
        body: { currency_code: l.currency_code },
      }),
    onSuccess: (_, l) => {
      toast.success(`Recorded ${money(l.amount, l.currency_code)} paid to ${l.seller?.name ?? "the seller"}.`)
      queryClient.invalidateQueries({ queryKey: ["reseller-seller-payouts"] })
    },
    onError: (e) => toast.error(errorText(e)),
  })
  const markPaid = async (l: Line) => {
    const ok = await prompt({
      title: "Record this payout?",
      description: `Only after you have paid ${l.seller?.name ?? "this seller"} ${money(l.amount, l.currency_code)} (${l.count} sales). Their commissions become paid.`,
      confirmText: "Yes, mark paid",
      cancelText: "Not yet",
    })
    if (ok) pay.mutate(l)
  }
  const busy = pay.isPending ? pay.variables : undefined

  return (
    <div className="flex flex-col gap-4">
      <Heading>Seller payouts</Heading>
      {isLoading && <Text className="text-ui-fg-subtle">Loading…</Text>}
      {error && <Text className="text-ui-fg-error">{errorText(error)}</Text>}
      {data && (
        <>
          <Lines
            title="To pay now"
            help="Approved commissions. Pay the seller first (bank, ABA, cash), then mark it paid here."
            lines={data.due}
            action={(l) => (
              <Button
                size="small"
                disabled={!!busy}
                isLoading={busy?.seller_id === l.seller_id && busy?.currency_code === l.currency_code}
                onClick={() => markPaid(l)}
              >
                Mark paid
              </Button>
            )}
          />
          <Lines title="Coming up" help="Commissions not approved yet. They move to “To pay now” on the next payout day." lines={data.pending} />
        </>
      )}
    </div>
  )
}

export const config = defineRouteConfig({
  label: "Seller payouts",
})

export default SellerPayoutsPage
