import { listOrderTickets } from "@lib/data/booking"
import { Heading, Text } from "@modules/common/components/ui"
import QRCode from "qrcode"

// An order's event tickets (TASKS P3-24): each with its code to show at the
// door. Nothing for an order without tickets. They are issued just after the
// order is placed, so a fresh confirmation page may not list them yet; the
// email has them too. Each code is also drawn as a QR code, here on the
// server (P3-24 follow-up): the code never goes to an outside QR service.
export default async function EventTickets({ orderId, held = false }: { orderId: string; held?: boolean }) {
  // Pay later, not paid yet: the codes wait for the payment.
  if (held) {
    return null
  }
  const tickets = await listOrderTickets(orderId)
  if (!tickets.length) {
    return null
  }
  const qr = await Promise.all(
    tickets.map((t) => QRCode.toString(t.code, { type: "svg", margin: 1, errorCorrectionLevel: "M" }).catch(() => null))
  )
  return (
    <div className="flex flex-col gap-y-3" data-testid="event-tickets">
      <Heading level="h3" className="txt-large-plus">
        Your tickets
      </Heading>
      <Text className="txt-small text-ui-fg-subtle">Show a code at the door. Each code lets one person in once.</Text>
      <ul className="flex flex-col gap-y-2">
        {tickets.map((t, i) => (
          <li key={t.code} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ui-border-base px-3 py-2">
            {qr[i] && (
              <span
                className="block h-24 w-24 shrink-0"
                role="img"
                aria-label={`QR code for ticket ${t.code}`}
                data-testid="ticket-qr"
                // qrcode's own SVG output for our ticket code (no user HTML).
                dangerouslySetInnerHTML={{ __html: qr[i]! }}
              />
            )}
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
