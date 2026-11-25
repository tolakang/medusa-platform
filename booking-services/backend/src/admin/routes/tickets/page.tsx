import { defineRouteConfig } from "@medusajs/admin-sdk"
import { Tag } from "@medusajs/icons"
import { Badge, Button, Container, Heading, Input, Label, Text, toast } from "@medusajs/ui"
import { useMutation } from "@tanstack/react-query"
import { useState } from "react"
import { sdk } from "../../lib/sdk"
import { errorText, statusLabel } from "../../lib/format"
import { usePageTitle } from "../../lib/page-title"

// Tickets (TASKS P3-24): at the door, type the code a guest shows, see the
// event, date and section, and let them in once. Reads GET
// /admin/booking/tickets/:code, writes POST /admin/booking/tickets/:code/use.

type Ticket = {
  code: string
  order_id: string
  event_title: string
  label: string
  status: "valid" | "used"
  used_at: string | null
}


const TicketsPage = () => {
  usePageTitle("Tickets")
  const [code, setCode] = useState("")
  const [ticket, setTicket] = useState<Ticket | null>(null)

  const find = useMutation({
    mutationFn: () => sdk.client.fetch<{ ticket: Ticket }>(`/admin/booking/tickets/${encodeURIComponent(code.trim())}`),
    onSuccess: (r) => setTicket(r.ticket),
    onError: (e) => {
      setTicket(null)
      toast.error(errorText(e))
    },
  })
  const use = useMutation({
    mutationFn: () => sdk.client.fetch<{ ticket: Ticket }>(`/admin/booking/tickets/${encodeURIComponent(ticket!.code)}/use`, { method: "POST" }),
    onSuccess: (r) => setTicket(r.ticket),
  })

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h1">Tickets</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          Type the code on the guest&apos;s ticket (dashes and case don&apos;t matter). Each ticket lets one person in
          once.
        </Text>
      </div>
      <form
        className="flex flex-wrap items-end gap-3 px-6 py-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (code.trim()) {
            use.reset()
            find.mutate()
          }
        }}
      >
        <div className="flex flex-col gap-y-1">
          <Label size="small" htmlFor="ticket-code">
            Code
          </Label>
          <Input id="ticket-code" value={code} placeholder="K7QW-P3MZ-XA" onChange={(e) => setCode(e.target.value)} autoFocus />
        </div>
        <Button size="small" type="submit" disabled={!code.trim()} isLoading={find.isPending}>
          Check
        </Button>
      </form>
      {find.error && (
        <Text className="px-6 py-4 text-ui-fg-error" data-testid="ticket-not-found">
          {errorText(find.error)}
        </Text>
      )}
      {ticket && (
        <div className="flex flex-col gap-y-2 px-6 py-4">
          <div className="flex items-center gap-x-2">
            <Text className="font-mono txt-large-plus">{ticket.code}</Text>
            <Badge size="2xsmall" color={ticket.status === "valid" ? "green" : "grey"}>
              {ticket.status === "valid" ? "Valid" : "Used"}
            </Badge>
          </div>
          <Text>
            {ticket.event_title} · {ticket.label}
          </Text>
          {ticket.status === "used" && ticket.used_at && (
            <Text size="small" className="text-ui-fg-subtle">
              Used {new Date(ticket.used_at).toLocaleString()}
            </Text>
          )}
          {ticket.status === "valid" && (
            <Button size="small" className="self-start" isLoading={use.isPending} onClick={() => use.mutate()}>
              Let in
            </Button>
          )}
          {use.error && <Text className="text-ui-fg-error">{errorText(use.error)}</Text>}
        </div>
      )}
    </Container>
  )
}

export const config = defineRouteConfig({
  label: "Tickets", icon: Tag,
})

export default TicketsPage
