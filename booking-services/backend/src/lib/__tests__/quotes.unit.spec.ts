import { isQuoteOnly, QUOTE_NOT_OPEN_MESSAGE, QUOTE_NOT_PRICED_MESSAGE, quoteBookable, quoteEmail } from "../quotes"

// TASKS P3-27: quote rules.
describe("quotes", () => {
  it("knows a quote-only service", () => {
    expect(isQuoteOnly({ metadata: { quote_only: true } })).toBe(true)
    expect(isQuoteOnly({ metadata: { quote_only: "true" } })).toBe(false)
  })

  it("books only a priced, open quote", () => {
    const now = new Date("2026-11-20T00:00:00Z")
    const quoted = { status: "quoted", amount: 120, starts_at: "2026-11-25T01:00:00Z", valid_until: "2026-11-27T00:00:00Z" }
    expect(quoteBookable(quoted, now)).toBeNull()
    expect(quoteBookable({ ...quoted, valid_until: "2026-11-19T00:00:00Z" }, now)).toBe(QUOTE_NOT_OPEN_MESSAGE)
    expect(quoteBookable({ status: "requested" }, now)).toBe(QUOTE_NOT_PRICED_MESSAGE)
    expect(quoteBookable({ ...quoted, status: "declined" }, now)).toBe(QUOTE_NOT_OPEN_MESSAGE)
    expect(quoteBookable({ ...quoted, amount: null }, now)).toBe(QUOTE_NOT_PRICED_MESSAGE)
  })

  it("emails the price, the time and the reply", () => {
    const { subject, html } = quoteEmail(
      { service: "Full house move", amount: 120, currency_code: "usd", when: "Mon 23 Nov, 08:00", reply: "Two trucks <needed>", valid_until: "2026-11-27" },
      (s) => s.replace(/</g, "&lt;")
    )
    expect(subject).toBe("Your quote: Full house move, $120.00")
    expect(html).toContain("Two trucks &lt;needed>")
    expect(html).toContain("2026-11-27")
  })
})
