import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Clock } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Table, Text, toast, usePrompt } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { sdk } from "../../lib/sdk"

// Waitlist (TASKS P3-29 follow-up): who waits for a full day of which
// service, soonest day first. "Time free" = the waitlist job emailed them.
// Reads GET /admin/booking/waitlist.

type Entry = {
  id: string
  date: string
  status: "waiting" | "notified"
  notified_at: string | null
  service: string | null
  customer: { email: string; name: string | null } | null
}

const WaitlistPage = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["booking-waitlist"],
    queryFn: () => sdk.client.fetch<{ waitlist: Entry[] }>("/admin/booking/waitlist"),
  })
  // Take someone off the list (gap review 2026-11-24).
  const queryClient = useQueryClient()
  const prompt = usePrompt()
  const remove = useMutation({
    mutationFn: (id: string) => sdk.client.fetch(`/admin/booking/waitlist/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Taken off the waitlist.")
      queryClient.invalidateQueries({ queryKey: ["booking-waitlist"] })
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't remove them."),
  })
  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h1">Waitlist</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Customers waiting for a full day. When a time frees up they are emailed once; the first to book gets it.
        </Text>
      </div>
      {isLoading && <Text className="px-6 py-4">Loading…</Text>}
      {error && <Text className="px-6 py-4 text-ui-fg-error">{(error as Error).message}</Text>}
      {data?.waitlist.length === 0 && <Text className="px-6 py-4 text-ui-fg-subtle">Nobody is waiting.</Text>}
      {!!data?.waitlist.length && (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>Day</Table.HeaderCell>
              <Table.HeaderCell>Service</Table.HeaderCell>
              <Table.HeaderCell>Customer</Table.HeaderCell>
              <Table.HeaderCell>Status</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {data.waitlist.map((w) => (
              <Table.Row key={w.id}>
                <Table.Cell>
                  {new Date(`${w.date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}
                </Table.Cell>
                <Table.Cell>{w.service ?? "—"}</Table.Cell>
                <Table.Cell>{w.customer ? w.customer.name ?? w.customer.email : "—"}</Table.Cell>
                <Table.Cell>
                  <Badge size="2xsmall" color={w.status === "notified" ? "green" : "orange"}>
                    {w.status === "notified" ? "time free, told" : "waiting"}
                  </Badge>
                </Table.Cell>
                <Table.Cell className="text-right">
                  <Button
                    size="small"
                    variant="secondary"
                    isLoading={remove.isPending && remove.variables === w.id}
                    disabled={remove.isPending}
                    onClick={async () => {
                      const ok = await prompt({
                        title: "Take them off the waitlist?",
                        description: "They won't be emailed when a time frees up.",
                        confirmText: "Remove",
                        cancelText: "Keep",
                      })
                      if (ok) remove.mutate(w.id)
                    }}
                  >
                    Remove
                  </Button>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({ label: "Waitlist", icon: Clock })

export default WaitlistPage
