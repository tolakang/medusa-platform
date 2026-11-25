import { toTiers } from "../price-tiers";

describe("toTiers", () => {
  it("merges break points with the same amount into ranges", () => {
    expect(
      toTiers(
        new Map([
          [1, 47.2],
          [10, 44.25],
          [11, 44.25],
        ])
      )
    ).toEqual([
      { min_quantity: 1, max_quantity: 9, amount: 47.2 },
      { min_quantity: 10, max_quantity: null, amount: 44.25 },
    ]);
  });

  it("one price is one open tier; no price is none", () => {
    expect(toTiers(new Map([[1, 5]]))).toEqual([
      { min_quantity: 1, max_quantity: null, amount: 5 },
    ]);
    expect(toTiers(new Map())).toEqual([]);
    expect(toTiers(undefined)).toEqual([]);
  });
});
