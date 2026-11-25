import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ReceiptPercent } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Table, Text, toast, usePrompt } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { sdk } from "../../lib/sdk"
import { usePageTitle } from "../../lib/page-title"

// Passes (TASKS P3-29 follow-up): customers' passes, soonest to expire first,
// with credits left and the order they came from. Reads GET /admin/booking/passes.

type Pass = {
  id: string
  title: string
  credits_total: number
  credits_left: number
  expires_at: string
  order_display_id: number | null
  customer: { email: string; name: string | null } | null
}

const PassesPage = () => {
  usePageTitle("Passes")
  const { data, isLoading, error } = useQuery({
    queryKey: ["booking-passes"],
    queryFn: () => sdk.client.fetch<{ passes: Pass[] }>("/admin/booking/passes"),
  })
  const now = data ? new Date().getTime() : 0
  // Give back a credit or end a pass (gap review 2026-11-24).
  const queryClient = useQueryClient()
  const prompt = usePrompt()
  const change = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown>; done: string }) =>
      sdk.client.fetch(`/admin/booking/passes/${id}`, { method: "POST", body }),
    onSuccess: (_, { done }) => {
      toast.success(done)
      queryClient.invalidateQueries({ queryKey: ["booking-passes"] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't change the pass."),
  })
  const end = async (p: Pass) => {
    const ok = await prompt({
      title: `End ${p.title} now?`,
      description: `${p.customer?.name ?? p.customer?.email ?? "The customer"} can't use the ${p.credits_left} credits left after today. This doesn't refund anything.`,
      variant: "danger",
      confirmText: "End pass",
      cancelText: "Keep it",
    })
    if (ok) change.mutate({ id: p.id, body: { expires_at: "now" }, done: "Pass ended." })
  }
  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h1">Passes</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Packs of visits customers bought. A booking paid with a pass takes one credit; cancelling in time gives it back.
        </Text>
      </div>
      {isLoading && <Text className="px-6 py-4">Loading…</Text>}
      {error && <Text className="px-6 py-4 text-ui-fg-error">{(error as Error).message}</Text>}
      {data?.passes.length === 0 && <Text className="px-6 py-4 text-ui-fg-subtle">No passes sold yet.</Text>}
      {!!data?.passes.length && (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Pass</Table.HeaderCell>
              <Table.HeaderCell>Customer</Table.HeaderCell>
              <Table.HeaderCell>Credits left</Table.HeaderCell>
              <Table.HeaderCell>Until</Table.HeaderCell>
              <Table.HeaderCell>Order</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {data.passes.map((p) => {
              const expired = new Date(p.expires_at).getTime() < now
              return (
                <Table.Row key={p.id}>
                  <Table.Cell>{p.title}</Table.Cell>
                  <Table.Cell>{p.customer ? p.customer.name ?? p.customer.email : "—"}</Table.Cell>
                  <Table.Cell>
                    {p.credits_left} of {p.credits_total}
                  </Table.Cell>
                  <Table.Cell>
                    {new Date(p.expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}{" "}
                    {expired && (
                      <Badge size="2xsmall" color="grey">
                        expired
                      </Badge>
                    )}
                  </Table.Cell>
                  <Table.Cell>{p.order_display_id != null ? `#${p.order_display_id}` : "—"}</Table.Cell>
                  <Table.Cell className="text-right">
                    <div className="flex justify-end gap-2">
                      {/* Extend by 30 days from the later of today and the end date. */}
                      <Button
                        size="small"
                        variant="secondary"
                        disabled={change.isPending}
                        onClick={() => {
                          const from = Math.max(now, new Date(p.expires_at).getTime())
                          change.mutate({
                            id: p.id,
                            body: { expires_at: new Date(from + 30 * 24 * 3600_000).toISOString() },
                            done: "Pass extended by 30 days.",
                          })
                        }}
                      >
                        Extend 30 days
                      </Button>
                    {!expired && (
                      <>
                        <Button
                          size="small"
                          variant="secondary"
                          disabled={change.isPending || p.credits_left >= p.credits_total}
                          onClick={() => change.mutate({ id: p.id, body: { credits_left: p.credits_left + 1 }, done: "One credit given back." })}
                        >
                          Give back 1
                        </Button>
                        <Button size="small" variant="secondary" disabled={change.isPending} onClick={() => end(p)}>
                          End now
                        </Button>
                      </>
                    )}
                    </div>
                  </Table.Cell>
                </Table.Row>
              )
            })}
          </Table.Body>
        </Table>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({ label: "Passes", icon: ReceiptPercent })

export default PassesPage
