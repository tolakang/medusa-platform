import { errorText, formatMoney, statusLabel } from "../format"

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
