import assert from "node:assert/strict"
import { test } from "node:test"
import { formatDate, formatDateTime } from "../util/format-date.ts"
import { nextBreak, sameTiers, tierFor, tierRange } from "../util/price-tiers.ts"

const tiers = [
  { min_quantity: 1, max_quantity: 9, amount: 47.2 },
  { min_quantity: 10, max_quantity: null, amount: 44.25 },
]

test("tier ranges read 1–9 and 10+", () => {
  assert.deepEqual(tiers.map(tierRange), ["1–9", "10+"])
})

test("a quantity falls in its tier", () => {
  assert.equal(tierFor(tiers, 9)?.amount, 47.2)
  assert.equal(tierFor(tiers, 10)?.amount, 44.25)
})

test("the next break and its saving per unit", () => {
  const hint = nextBreak(tiers, 4)
  assert.equal(hint?.tier.min_quantity, 10)
  assert.equal(Math.round(hint!.savingPerUnit * 100) / 100, 2.95)
  assert.equal(nextBreak(tiers, 12), null)
})

test("same tiers compare equal", () => {
  assert.ok(sameTiers(tiers, [...tiers]))
  assert.ok(!sameTiers(tiers, tiers.slice(0, 1)))
})

test("one date format", () => {
  assert.equal(formatDate("2026-11-25T23:30:00Z"), "25 Nov 2026")
  assert.equal(formatDate(null), "-")
  assert.equal(formatDate("nope"), "-")
  assert.match(formatDateTime("2026-11-25T14:05:00Z"), /^25 Nov 2026, 14:05 UTC$/)
})
