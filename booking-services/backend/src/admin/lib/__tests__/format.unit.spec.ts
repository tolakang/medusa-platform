import { cancelText, errorText, formatMoney, statusLabel } from "../format"

describe("admin format helpers", () => {
  it("formats money with the currency, and a dash when unknown", () => {
    expect(formatMoney(12.5, "usd")).toBe("$12.50")
    expect(formatMoney("40000", "khr")).toContain("40,000")
    expect(formatMoney(null, "usd")).toBe("–")
    expect(formatMoney("abc", "usd")).toBe("–")
  })
  it("shows statuses in staff words", () => {
    expect(statusLabel("no_show")).toBe("No-show")
    expect(statusLabel("something_new")).toBe("something new")
  })
  it("always gives an error sentence", () => {
    expect(errorText(new Error("Slot taken"))).toBe("Slot taken")
    expect(errorText(undefined)).toBe("Something went wrong. Try again.")
  })
})

describe("cancel line and errors", () => {
  it("shows the refunded amount with its currency", () => {
    expect(cancelText({ refund: "refunded", refunded_amount: 8 }, "usd")).toBe("Cancelled. $8.00 refunded.")
    expect(cancelText({ refund: "not_captured", refunded_amount: 0 }, "usd")).toBe("Cancelled. Nothing was paid, so nothing to refund.")
  })
  it("drops Medusa's Invalid request prefix", () => {
    expect(errorText(new Error("Invalid request: walk_in_phone: Enter a phone"))).toBe("walk_in_phone: Enter a phone")
  })
})
