import { priceChange } from "../change-length"

describe("changing a rental's dates or a trip's hours", () => {
  it("refunds when shorter, asks the rest when longer", () => {
    expect(priceChange(75, 50)).toEqual({ refund: 25, due: 0 })
    expect(priceChange(30, 45)).toEqual({ refund: 0, due: 15 })
    expect(priceChange(30, 30)).toEqual({ refund: 0, due: 0 })
    expect(priceChange(10.1, 10.05)).toEqual({ refund: 0.05, due: 0 })
  })
})
