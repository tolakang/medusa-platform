import { listOrderTickets } from "@lib/data/booking"
import { Heading, Text } from "@modules/common/components/ui"

// An order's event tickets (TASKS P3-24): each with its code to show at the
// door. Nothing for an order without tickets. They are issued just after the
// order is placed, so a fresh confirmation page may not list them yet; the
// email has them too.
export default async function EventTickets({ orderId }: { orderId: string }) {
  const tickets = await listOrderTickets(orderId)
  if (!tickets.length) {
    return null
  }
  return (
    <div className="flex flex-col gap-y-3" data-testid="event-tickets">
      <Heading level="h3" className="txt-large-plus">
        Your tickets
      </Heading>
      <Text className="txt-small text-ui-fg-subtle">Show a code at the door. Each code lets one person in once.</Text>
      <ul className="flex flex-col gap-y-2">
        {tickets.map((t) => (
          <li key={t.code} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ui-border-base px-3 py-2">
            <span>
              <span className="block txt-small-plus">{t.event_title}</span>
              <span className="block txt-small text-ui-fg-subtle">{t.label}</span>
            </span>
            <span className="font-mono txt-large-plus" data-testid="ticket-code">
              {t.code}
              {t.status === "used" && <span className="ml-2 txt-small text-ui-fg-subtle">(used)</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
