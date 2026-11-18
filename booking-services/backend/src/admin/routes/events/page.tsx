import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Badge, Button, Container, Heading, Text } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { STATUS_COLOR } from "../../lib/booking-calendar"
import { sdk } from "../../lib/sdk"

// Events (TASKS P3-30): event packages with all their pieces on one card,
// soonest first (the next 90 days). Cancel cancels every piece; the
// cancellation policy decides the refund of the package's price. Reads GET
// /admin/booking/events, writes POST /admin/booking/events/:id/cancel.

type Piece = { id: string; title: string | null; status: string; starts_at: string; ends_at: string; resource: string | null; timezone: string | null }
type Event = {
  id: string
  title: string
  event_date: string | null
  status: string
  order: { id: string; display_id: number; email: string } | null
  address: string | null
  notes: string | null
  pieces: Piece[]
}

const errorText = (e: unknown) => (e as { message?: string })?.message ?? "Something went wrong."
const when = (p: Piece) => {
  const opts = { timeZone: p.timezone ?? undefined, hour: "2-digit", minute: "2-digit", hourCycle: "h23" } as const
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: p.timezone ?? undefined, weekday: "short", day: "numeric", month: "short" })
  const long = new Date(p.ends_at).getTime() - new Date(p.starts_at).getTime() >= 86_400_000
  const first = day.format(new Date(p.starts_at))
  const last = day.format(new Date(new Date(p.ends_at).getTime() - 1))
  return long
    ? first === last
      ? `${first} (all day)`
      : `${first} – ${last}`
    : `${day.format(new Date(p.starts_at))}, ${new Intl.DateTimeFormat("en-GB", opts).format(new Date(p.starts_at))}–${new Intl.DateTimeFormat("en-GB", opts).format(new Date(p.ends_at))}`
}

const EventsPage = () => {
  const client = useQueryClient()
  const [confirming, setConfirming] = useState<string | null>(null)
  const { data, isLoading, error } = useQuery({
    queryKey: ["booking-events"],
    queryFn: () => sdk.client.fetch<{ events: Event[] }>("/admin/booking/events"),
  })
  const cancel = useMutation({
    mutationFn: (id: string) =>
      sdk.client.fetch<{ refund: string; refunded_amount: number }>(`/admin/booking/events/${id}/cancel`, { method: "POST" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["booking-events"] }),
  })
  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h1">Events</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Event packages in the next 90 days, with every piece. Cancelling cancels them all; the cancellation policy
          decides the refund.
        </Text>
      </div>
      {isLoading && <Text className="px-6 py-4">Loading…</Text>}
      {error && <Text className="px-6 py-4 text-ui-fg-error">{errorText(error)}</Text>}
      {data?.events.length === 0 && <Text className="px-6 py-4 text-ui-fg-subtle">No event packages coming up.</Text>}
      {cancel.data && (
        <Text className="px-6 py-4 text-ui-fg-subtle">
          Cancelled. Refund: {cancel.data.refund.replace(/_/g, " ")}
          {cancel.data.refunded_amount ? ` (${cancel.data.refunded_amount})` : ""}.
        </Text>
      )}
      {cancel.error && <Text className="px-6 py-4 text-ui-fg-error">{errorText(cancel.error)}</Text>}
      {data?.events.map((e) => (
        <div key={e.id} className="flex flex-col gap-y-2 px-6 py-4" data-testid="event-row">
          <div className="flex flex-wrap items-center gap-x-3">
            <Text weight="plus">{e.title}</Text>
            {e.event_date && (
              <Text size="small">
                {new Date(`${e.event_date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}
              </Text>
            )}
            <Badge size="2xsmall" color={STATUS_COLOR[e.status as keyof typeof STATUS_COLOR] ?? "grey"}>
              {e.status}
            </Badge>
          </div>
          <Text size="small" className="text-ui-fg-subtle">
            {e.order ? `Order #${e.order.display_id} · ${e.order.email}` : "Not paid yet"}
            {e.address ? ` · At: ${e.address}` : ""}
          </Text>
          {e.notes && <Text size="small" className="text-ui-fg-subtle">{e.notes}</Text>}
          <ul className="flex flex-col gap-y-1 pl-4">
            {e.pieces.map((p) => (
              <li key={p.id}>
                <Text size="small">
                  {when(p)} · {p.title ?? "Piece"} · {p.resource ?? ""}
                  {p.status !== e.status ? ` (${p.status})` : ""}
                </Text>
              </li>
            ))}
          </ul>
          {(e.status === "confirmed" || e.status === "pending") && confirming !== e.id && (
            <Button size="small" variant="secondary" className="self-start" onClick={() => setConfirming(e.id)}>
              Cancel event
            </Button>
          )}
          {confirming === e.id && (
            <div className="flex items-center gap-2">
              <Text size="xsmall" className="text-ui-fg-subtle">All pieces are cancelled; the policy decides any refund.</Text>
              <Button size="small" variant="secondary" onClick={() => setConfirming(null)}>
                Keep
              </Button>
              <Button
                size="small"
                variant="danger"
                isLoading={cancel.isPending}
                onClick={() => {
                  setConfirming(null)
                  cancel.mutate(e.id)
                }}
              >
                Yes, cancel all
              </Button>
            </div>
          )}
        </div>
      ))}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Events",
})

export default EventsPage
