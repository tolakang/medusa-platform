import { defineRouteConfig } from "@medusajs/admin-sdk"
import { ChatBubbleLeftRight } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Input, Label, Select, Text, Textarea, usePrompt } from "@medusajs/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { walkInTimes } from "../../lib/booking-calendar"
import { sdk } from "../../lib/sdk"
import { errorText, formatDate, formatDateTime, formatMoney, statusLabel } from "../../lib/format"

// Quotes (TASKS P3-27): requests for quote-only services. Staff pick a
// calendar, a time, a length and a price, add a note, and send it; the
// customer is emailed and accepts in their account. Reads GET
// /admin/booking/quotes and /admin/booking/resources; writes POST
// /admin/booking/quotes/:id and /:id/decline.

type Quote = {
  id: string
  variant_id: string
  service: string | null
  customer: { email: string; name: string | null } | null
  details: string
  address: string | null
  dropoff_address: string | null
  wished_starts_at: string
  status: "requested" | "quoted" | "accepted" | "declined" | "expired"
  amount: number | null
  currency_code: string | null
  resource_id: string | null
  starts_at: string | null
  reply: string | null
  valid_until: string | null
}
type Resource = { id: string; name: string; timezone: string; product_variants?: { id: string }[] }

const COLORS = { requested: "orange", quoted: "blue", accepted: "green", declined: "grey", expired: "grey" } as const
// A datetime-local value in the calendar's zone (review finding: the
// browser's zone moved quotes by hours for staff elsewhere).
const local = (iso: string, timeZone: string) => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value])
  )
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
}

const PriceForm = ({ quote, resources, onDone }: { quote: Quote; resources: Resource[]; onDone: () => void }) => {
  const offered = resources.filter((r) => (r.product_variants ?? []).some((v) => v.id === quote.variant_id))
  const [resourceId, setResourceId] = useState(quote.resource_id ?? offered[0]?.id ?? "")
  const zoneOf = (id: string) => resources.find((r) => r.id === id)?.timezone ?? "UTC"
  const [startsAt, setStartsAt] = useState(local(quote.starts_at ?? quote.wished_starts_at, zoneOf(resourceId)))
  const [hours, setHours] = useState("4")
  const [amount, setAmount] = useState(quote.amount?.toString() ?? "")
  const [reply, setReply] = useState(quote.reply ?? "")
  const send = useMutation({
    mutationFn: () =>
      sdk.client.fetch(`/admin/booking/quotes/${quote.id}`, {
        method: "POST",
        body: {
          amount: Number(amount),
          currency_code: quote.currency_code ?? "usd",
          resource_id: resourceId,
          starts_at: walkInTimes(startsAt.slice(0, 10), startsAt.slice(11, 16), 1, zoneOf(resourceId)).starts_at,
          duration_minutes: Math.round(Number(hours) * 60),
          reply: reply.trim() || null,
        },
      }),
    onSuccess: onDone,
  })
  const ok = resourceId && startsAt && Number(hours) > 0 && amount !== "" && Number(amount) >= 0
  return (
    <form
      className="grid grid-cols-2 gap-3 pt-3 md:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (ok) send.mutate()
      }}
    >
      <div className="flex flex-col gap-y-1">
        <Label size="small">Calendar</Label>
        <Select value={resourceId} onValueChange={setResourceId}>
          <Select.Trigger>
            <Select.Value placeholder="Choose" />
          </Select.Trigger>
          <Select.Content>
            {offered.map((r) => (
              <Select.Item key={r.id} value={r.id}>
                {r.name}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
      </div>
      <div className="flex flex-col gap-y-1">
        <Label size="small">Starts</Label>
        <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        <Text size="xsmall" className="text-ui-fg-subtle">{zoneOf(resourceId)}</Text>
      </div>
      <div className="flex flex-col gap-y-1">
        <Label size="small">Hours</Label>
        <Input type="number" min="0.25" step="0.25" value={hours} onChange={(e) => setHours(e.target.value)} />
      </div>
      <div className="flex flex-col gap-y-1">
        <Label size="small">Price ({(quote.currency_code ?? "usd").toUpperCase()})</Label>
        <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="col-span-2 flex flex-col gap-y-1 md:col-span-4">
        <Label size="small">Note to the customer</Label>
        <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="What the price includes" />
      </div>
      <div className="col-span-2 flex items-center gap-x-3 md:col-span-4">
        <Button size="small" type="submit" disabled={!ok} isLoading={send.isPending}>
          {quote.status === "quoted" ? "Send new price" : "Send quote"}
        </Button>
        {send.error && <Text className="text-ui-fg-error">{errorText(send.error)}</Text>}
      </div>
    </form>
  )
}

const QuotesPage = () => {
  const client = useQueryClient()
  const [status, setStatus] = useState("requested")
  const [open, setOpen] = useState<string | null>(null)
  const quotes = useQuery({
    queryKey: ["booking-quotes", status],
    queryFn: () => sdk.client.fetch<{ quotes: Quote[] }>(`/admin/booking/quotes${status === "all" ? "" : `?status=${status}`}`),
  })
  const resources = useQuery({
    queryKey: ["booking-resources-for-quotes"],
    queryFn: () => sdk.client.fetch<{ resources: Resource[] }>("/admin/booking/resources"),
  })
  const prompt = usePrompt()
  const decline = useMutation({
    mutationFn: (id: string) => sdk.client.fetch(`/admin/booking/quotes/${id}/decline`, { method: "POST" }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["booking-quotes"] }),
  })
  const done = () => {
    setOpen(null)
    client.invalidateQueries({ queryKey: ["booking-quotes"] })
  }

  return (
    <Container className="divide-y p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
        <div>
          <Heading level="h1">Quotes</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Customers ask for a price on quote-only services. Send a price, a calendar and a time; they accept and pay
            online.
          </Text>
        </div>
        <Select value={status} onValueChange={setStatus}>
          <Select.Trigger className="w-40">
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            {["requested", "quoted", "accepted", "declined", "expired", "all"].map((s) => (
              <Select.Item key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
      </div>
      {quotes.isLoading && <Text className="px-6 py-4">Loading…</Text>}
      {quotes.data?.quotes.length === 0 && <Text className="px-6 py-4 text-ui-fg-subtle">No quotes here.</Text>}
      {quotes.data?.quotes.map((q) => (
        <div key={q.id} className="px-6 py-4" data-testid="quote-row">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Text weight="plus">{q.service ?? "Service"}</Text>
            <Badge size="2xsmall" color={COLORS[q.status]}>
              {statusLabel(q.status)}
            </Badge>
            <Text size="small" className="text-ui-fg-subtle">
              {q.customer?.name ?? q.customer?.email ?? "Customer"} · wished {new Date(q.wished_starts_at).toLocaleString()}
            </Text>
          </div>
          <Text size="small" className="mt-1 whitespace-pre-wrap">
            {q.details}
          </Text>
          {(q.address || q.dropoff_address) && (
            <Text size="small" className="text-ui-fg-subtle">
              {[q.address, q.dropoff_address].filter(Boolean).join(" → ")}
            </Text>
          )}
          {q.amount !== null && q.starts_at && (
            <Text size="small" className="mt-1">
              Quoted {formatMoney(q.amount, q.currency_code)} for {formatDateTime(q.starts_at)}
              {q.valid_until ? `, valid until ${formatDate(q.valid_until)}` : ""}
            </Text>
          )}
          {(q.status === "requested" || q.status === "quoted") && (
            <div className="mt-2 flex gap-x-2">
              <Button size="small" variant="secondary" onClick={() => setOpen(open === q.id ? null : q.id)}>
                {q.status === "requested" ? "Price it" : "Change price"}
              </Button>
              <Button size="small" variant="transparent" isLoading={decline.isPending && decline.variables === q.id} onClick={async () => {
                  const ok = await prompt({
                    title: "Decline this request?",
                    description: `${q.customer?.name ?? q.customer?.email ?? "The customer"} is told you can't do it.`,
                    variant: "danger",
                    confirmText: "Decline",
                    cancelText: "Back",
                  })
                  if (ok) decline.mutate(q.id)
                }}>
                Decline
              </Button>
            </div>
          )}
          {open === q.id && <PriceForm quote={q} resources={resources.data?.resources ?? []} onDone={done} />}
        </div>
      ))}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Quotes", icon: ChatBubbleLeftRight,
})

export default QuotesPage
