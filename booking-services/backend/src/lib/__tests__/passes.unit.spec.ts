import { PASS_EMPTY_MESSAGE, PASS_EXPIRED_MESSAGE, PASS_SERVICE_MESSAGE, passProblem, passProduct } from "../passes"

describe("passes (TASKS P3-29)", () => {
  it("reads a pass product's Metadata", () => {
    expect(passProduct({ pass_credits: 5, pass_valid_days: 180, pass_for: ["haircut"] })).toEqual({ credits: 5, valid_days: 180, covers: ["haircut"] })
    expect(passProduct({ pass_credits: 5, pass_for: ["haircut", 3] })).toEqual({ credits: 5, valid_days: 365, covers: ["haircut"] })
    expect(passProduct({ pass_credits: 5, pass_valid_days: 9999, pass_for: ["x"] })?.valid_days).toBe(365)
    expect(passProduct({ pass_credits: 0, pass_for: ["x"] })).toBeNull()
    expect(passProduct({ pass_credits: 5 })).toBeNull()
    expect(passProduct(null)).toBeNull()
  })

  it("pays for a covered service before it expires, while credits last", () => {
    const pass = { credits_left: 2, expires_at: "2026-12-31T00:00:00Z", product_ids: ["prod_hair"] }
    const at = new Date("2026-12-01T02:00:00Z")
    expect(passProblem(pass, "prod_hair", at, 0)).toBeNull()
    expect(passProblem(pass, "prod_hair", at, 1)).toBeNull()
    expect(passProblem(pass, "prod_hair", at, 2)).toBe(PASS_EMPTY_MESSAGE)
    expect(passProblem(pass, "prod_ac", at, 0)).toBe(PASS_SERVICE_MESSAGE)
    expect(passProblem(pass, "prod_hair", new Date("2027-01-02T00:00:00Z"), 0)).toBe(PASS_EXPIRED_MESSAGE)
  })
})
