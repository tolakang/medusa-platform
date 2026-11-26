import { normalizePhone, personName } from "../person"

describe("personName", () => {
  it("prefers the customer, then the address names", () => {
    expect(personName({ first_name: "Sok", last_name: "Dara" }, { first_name: "X" })).toBe("Sok Dara")
    expect(personName({ first_name: null, last_name: null }, { first_name: "Dara", last_name: "Guest" })).toBe("Dara Guest")
    expect(personName(null, undefined, { first_name: "Ship" })).toBe("Ship")
    expect(personName(null, { first_name: "" })).toBeNull()
  })
})

describe("normalizePhone", () => {
  it("writes Cambodian numbers one way", () => {
    expect(normalizePhone("012345678")).toBe("+855 12 345 678")
    expect(normalizePhone("012 345 678")).toBe("+855 12 345 678")
    expect(normalizePhone("+855 12 345 678")).toBe("+855 12 345 678")
    expect(normalizePhone("+855-12-345-678")).toBe("+855 12 345 678")
    expect(normalizePhone("855 12 345 678")).toBe("+855 12 345 678")
    expect(normalizePhone("0961234567")).toBe("+855 96 123 4567")
  })
  it("keeps other numbers as digits", () => {
    expect(normalizePhone("+1 (415) 555-0100")).toBe("+14155550100")
    expect(normalizePhone("12345678")).toBe("12345678")
    expect(normalizePhone("  ")).toBeNull()
    expect(normalizePhone(null)).toBeNull()
  })
})
