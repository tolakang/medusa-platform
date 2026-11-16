import { portalLink } from "../email-verified"

describe("portalLink (TASKS F-100)", () => {
  it("uses the portal URL setting first", () => {
    expect(portalLink("verify-account", { token: "t" }, "https://portal.example.com/", "https://other.example.com")).toBe(
      "https://portal.example.com/verify-account?token=t"
    )
  })

  it("falls back to the first http(s) CORS origin", () => {
    expect(portalLink("verify-account", { token: "a b" }, undefined, " /local , https://p.example.com,https://q.example.com")).toBe(
      "https://p.example.com/verify-account?token=a+b"
    )
  })

  it("is null when neither is set", () => {
    expect(portalLink("verify-account", {}, "", "")).toBeNull()
    expect(portalLink("verify-account", {}, undefined, undefined)).toBeNull()
  })
})
