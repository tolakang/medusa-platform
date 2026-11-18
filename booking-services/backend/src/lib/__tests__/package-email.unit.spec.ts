import { packageChangedEmail } from "../package-email"

const esc = (s: string) => s.replace(/</g, "&lt;")

describe("package changed email (TASKS P3-30 follow-up)", () => {
  it("says the new date of a moved event", () => {
    const e = packageChangedEmail({ kind: "moved", title: "Small wedding", event_date: "2026-12-05", new_date: "2026-12-12", customer_name: "Sok" }, esc)
    expect(e.subject).toBe("Small wedding: now on Saturday, 12 December 2026")
    expect(e.html).toContain("from Saturday, 5 December 2026 to <strong>Saturday, 12 December 2026</strong>")
  })

  it("says a cancellation and the refund", () => {
    const e = packageChangedEmail({ kind: "cancelled", title: "Small <b>", event_date: "2026-12-05", refunded_amount: 45, currency_code: "usd" }, esc)
    expect(e.subject).toBe("Small <b> on Saturday, 5 December 2026 cancelled")
    expect(e.html).toContain("Small &lt;b>")
    expect(e.html).toContain("$45.00 is refunded")
  })
})
