import assert from "node:assert/strict"
import { test } from "node:test"
import { customerContact, customerLabel, hoursText, isValidPhone, money, parseHours, parseLengths, priceValue } from "../format.ts"
import { seal, unseal } from "../session-seal.ts"

test("walk-in name and phone", () => {
  assert.equal(customerLabel({ customer: null, walk_in_name: "Chan", walk_in_phone: "012 345 678" }), "Walk-in: Chan")
  assert.equal(customerContact({ customer: null, walk_in_name: "Chan", walk_in_phone: "012 345 678" }), "012 345 678")
  const guest = { customer_name: "Dara Guest", customer: { email: "d@b.test", first_name: null, last_name: null } }
  assert.equal(customerLabel(guest), "Dara Guest")
  assert.equal(customerContact(guest), "d@b.test")
  assert.equal(customerLabel({ customer: null }), "Walk-in")
  assert.equal(isValidPhone("+855 12 345 678"), true)
  assert.equal(isValidPhone(""), true)
  assert.equal(isValidPhone("call me"), false)
  assert.equal(isValidPhone("1234"), false)
})

test("money and customer labels", () => {
  assert.equal(money(12.5, "usd"), "$12.50")
  assert.equal(customerLabel({ customer: { email: "a@b.test", first_name: "Tola", last_name: null } }), "Tola")
  assert.equal(customerLabel({ customer: { email: "a@b.test", first_name: null, last_name: null } }), "a@b.test")
  assert.equal(customerLabel({ customer: null }), "Walk-in")
})

test("weekly hours: text per weekday both ways", () => {
  const hours = parseHours({ 1: "9:00-12:00, 13:00 - 17:00", 2: "", 6: "08:30–11:00" })
  assert.deepEqual(hours, [
    { weekday: 1, start_time: "09:00", end_time: "12:00" },
    { weekday: 1, start_time: "13:00", end_time: "17:00" },
    { weekday: 6, start_time: "08:30", end_time: "11:00" },
  ])
  assert.equal(hoursText(hours as never, 1), "09:00-12:00, 13:00-17:00")
  assert.equal(hoursText(hours as never, 2), "")
  assert.deepEqual(parseHours({}), [])
})

test("weekly hours: mistakes name the weekday", () => {
  assert.match(parseHours({ 3: "9 to 5" }) as string, /^Wednesday: write hours like/)
  assert.match(parseHours({ 3: "17:00-09:00" }) as string, /^Wednesday/)
  assert.match(parseHours({ 3: "25:00-26:00" }) as string, /^Wednesday/)
  assert.equal(parseHours({ 0: "09:00-12:00, 11:00-13:00" }), "Sunday: the hours overlap.")
})

test("service lengths and prices", () => {
  assert.deepEqual(parseLengths([{ minutes: "30", price: "10" }, { minutes: "", price: "" }, { minutes: "60", price: "17.999" }]), [
    { minutes: 30, price: 10 },
    { minutes: 60, price: 18 },
  ])
  assert.equal(parseLengths([{ minutes: "", price: "" }]), "Add at least one length with its price.")
  assert.match(parseLengths([{ minutes: "2", price: "1" }]) as string, /whole number of minutes/)
  assert.match(parseLengths([{ minutes: "30", price: "-1" }]) as string, /Enter a price/)
  assert.equal(parseLengths([{ minutes: "30", price: "1" }, { minutes: "30", price: "2" }]), "30 minutes is listed twice.")
  assert.equal(priceValue("0"), 0)
  assert.match(priceValue("free") as string, /Enter a price/)
})

test("the session cookie is sealed and can't be forged", () => {
  const sealed = seal("a-long-cookie-secret", "jwt-token")
  assert.notEqual(sealed, "jwt-token")
  assert.equal(unseal("a-long-cookie-secret", sealed), "jwt-token")
  assert.equal(unseal("another-cookie-secret", sealed), null)
  assert.equal(unseal("a-long-cookie-secret", sealed.slice(0, -2) + "xx"), null)
  assert.equal(unseal("a-long-cookie-secret", "garbage"), null)
  assert.equal(unseal("a-long-cookie-secret", undefined), null)
})
