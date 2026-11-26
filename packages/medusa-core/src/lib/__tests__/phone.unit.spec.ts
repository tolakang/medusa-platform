import { isValidPhone, normalizePhone } from "../phone"

describe("normalizePhone", () => {
  it("stores Cambodian numbers as +855 XX XXX XXX", () => {
    expect(normalizePhone("012345678")).toBe("+855 12 345 678")
    expect(normalizePhone("012 345 678")).toBe("+855 12 345 678")
    expect(normalizePhone("+855-12-345-678")).toBe("+855 12 345 678")
    expect(normalizePhone("855 12 345 678")).toBe("+855 12 345 678")
    expect(normalizePhone("0961234567")).toBe("+855 96 123 4567")
  })
  it("keeps other international numbers as +digits, empty as null", () => {
    expect(normalizePhone("+1 (415) 555-0100")).toBe("+14155550100")
    expect(normalizePhone("")).toBeNull()
    expect(normalizePhone(null)).toBeNull()
  })
  it("the stored format still passes isValidPhone", () => {
    expect(isValidPhone("+855 12 345 678")).toBe(true)
  })
})
