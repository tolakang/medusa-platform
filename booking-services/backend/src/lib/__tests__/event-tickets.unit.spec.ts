import { eventTicketsEmail, isEventProduct, normalizeTicketCode, ticketCode } from "../event-tickets"

// TASKS P3-24: event ticket helpers.
describe("event tickets", () => {
  it("knows an event product", () => {
    expect(isEventProduct({ metadata: { booking_kind: "F" } })).toBe(true)
    expect(isEventProduct({ metadata: { booking_kind: "D" } })).toBe(false)
    expect(isEventProduct(null)).toBe(false)
  })

  it("makes readable codes and reads them back however they are typed", () => {
    const code = ticketCode()
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{2}$/)
    expect(ticketCode(() => 0)).toBe("AAAA-AAAA-AA")
    expect(normalizeTicketCode(" k7qw p3mz-xa ")).toBe("K7QW-P3MZ-XA")
    expect(normalizeTicketCode("K7QW")).toBeNull()
    expect(normalizeTicketCode(undefined)).toBeNull()
  })

  it("emails every ticket with its code, escaped", () => {
    const { subject, html } = eventTicketsEmail({
      order_display_id: 12,
      customer_name: "Sok <Dara>",
      tickets: [
        { code: "AAAA-BBBB-CC", event_title: "Apsara show", label: "Sat 28 Nov 19:00 · VIP" },
        { code: "DDDD-EEEE-FF", event_title: "Apsara show", label: "Sat 28 Nov 19:00 · VIP" },
      ],
    })
    expect(subject).toBe("Your 2 tickets")
    expect(html).toContain("AAAA-BBBB-CC")
    expect(html).toContain("DDDD-EEEE-FF")
    expect(html).toContain("order #12")
    expect(html).toContain("Sok &lt;Dara&gt;")
  })
})
