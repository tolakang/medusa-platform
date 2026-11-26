import { strict as assert } from "node:assert"
import { describe, it } from "node:test"
import { actionError, commissionLabel, isValidPhone, OFFLINE_MESSAGE, PHONE_MESSAGE, commissionStatus, day, orderStatusLabel, money, pageFrom, selectionChange } from "../format.ts"
import { seal, unseal } from "../session-seal.ts"

// TASKS P5-08: portal helpers and the sealed session cookie.

describe("format (TASKS P5-08)", () => {
  it("formats money and days", () => {
    assert.equal(money(12.5, "usd"), "$12.50")
    assert.equal(money("3", "USD"), "$3.00")
    assert.equal(money(null, "usd"), "$0.00")
    // An unknown code still formats (Intl puts a no-break space after it).
    assert.match(money(1, "zzz"), /^ZZZ\s1\.00$/)
    assert.equal(day("2026-11-10T15:00:00Z"), "2026-11-10")
    assert.equal(day(null), "")
    assert.equal(day("nope"), "")
  })

  it("reads pages and statuses from the query", () => {
    assert.equal(pageFrom("3"), 3)
    for (const bad of [undefined, "0", "-1", "2.5", "x"]) {
      assert.equal(pageFrom(bad), 1)
    }
    assert.equal(pageFrom(["2", "5"]), 2)
    assert.equal(commissionStatus("paid"), "paid")
    assert.equal(commissionStatus("lost"), undefined)
  })

  it("works out what to add and remove", () => {
    assert.deepEqual(selectionChange(["a", "b"], ["b", "c"]), { add: ["c"], remove: ["a"] })
    assert.deepEqual(selectionChange([], []), { add: [], remove: [] })
    assert.deepEqual(selectionChange(["a"], ["a", "a"]), { add: [], remove: [] })
  })
})

describe("session cookie (TASKS P5-08)", () => {
  it("round-trips the token, hides it, and refuses another secret or tampering", () => {
    const sealed = seal("secret-a", "eyJhbGci.payload.sig")
    assert.ok(!sealed.includes("payload"))
    assert.equal(unseal("secret-a", sealed), "eyJhbGci.payload.sig")
    assert.equal(unseal("secret-b", sealed), null)
    const bytes = Buffer.from(sealed, "base64url")
    bytes[bytes.length - 1] ^= 1
    assert.equal(unseal("secret-a", bytes.toString("base64url")), null)
    assert.equal(unseal("secret-a", undefined), null)
  })
})

describe("status labels", () => {
  it("turns raw status words into plain labels", () => {
    assert.equal(orderStatusLabel("pending"), "Placed")
    assert.equal(orderStatusLabel("requires_action"), "Needs action")
    assert.equal(orderStatusLabel("some_new_state"), "Some new state")
    assert.equal(commissionLabel("approved"), "Due")
  })
})

describe("isValidPhone (settings)", () => {
  it("accepts empty and real numbers, refuses letters and short numbers", () => {
    assert.equal(isValidPhone(""), true)
    assert.equal(isValidPhone("012 345 678"), true)
    assert.equal(isValidPhone("+855 12 345 678"), true)
    assert.equal(isValidPhone("abc"), false)
    assert.equal(isValidPhone("12"), false)
    assert.match(PHONE_MESSAGE, /digits only/)
  })
})

describe("actionError (server actions)", () => {
  it("an unreachable backend asks to try again; other errors pass through", () => {
    assert.equal(actionError({ status: 502, message: "x" }), OFFLINE_MESSAGE)
    assert.equal(actionError({ status: 400, message: "Bad name" }), "Bad name")
  })
})
