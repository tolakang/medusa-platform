import { bookingCancelledEmail } from "../booking-cancel-email"

const esc = (s: string) => s.replace(/</g, "&lt;")

describe("booking cancelled email", () => {
  it("says the cancellation and the refund", () => {
    const e = bookingCancelledEmail(
      {
        service: "Hair <cut>",
        calendar: "Sophea",
        timezone: "Asia/Phnom_Penh",
        starts_at: "2026-12-05T03:00:00.000Z",
        refunded_amount: 12.5,
        currency_code: "usd",
        customer_name: "Sok",
      },
      esc
    )
    expect(e.subject).toBe("Hair <cut> on Sat 5 Dec, 10:00 cancelled")
    expect(e.html).toContain("Hello Sok,")
    expect(e.html).toContain("Hair &lt;cut>")
    expect(e.html).toContain("$12.50 is refunded to your payment.")
  })

  it("says no amount when nothing was refunded", () => {
    const e = bookingCancelledEmail({ calendar: "Sophea", timezone: "UTC", starts_at: "2026-12-05T03:00:00.000Z" }, esc)
    expect(e.html).toContain("Your booking</strong>")
    expect(e.html).not.toContain("refunded")
  })
})
