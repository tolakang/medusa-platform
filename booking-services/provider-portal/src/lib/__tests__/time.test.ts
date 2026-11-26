import assert from "node:assert/strict"
import { test } from "node:test"
import { addDays, dayLabel, dayWindow, isDate, timeRange, todayIn, toLocalTime, walkInTimes, zonedTimeToUtc, zoneLabel } from "../time.ts"

const PP = "Asia/Phnom_Penh" // UTC+7, no daylight saving

test("local time in the calendar's zone", () => {
  assert.deepEqual(toLocalTime(new Date("2026-11-19T11:30:00Z"), PP), { date: "2026-11-19", time: "18:30" })
  assert.deepEqual(toLocalTime(new Date("2026-11-19T18:00:00Z"), PP), { date: "2026-11-20", time: "01:00" })
  assert.equal(zonedTimeToUtc("2026-11-19", "18:30", PP).toISOString(), "2026-11-19T11:30:00.000Z")
  assert.equal(todayIn(PP, new Date("2026-11-19T18:00:00Z")), "2026-11-20")
})

test("a daylight-saving day keeps the wall-clock time", () => {
  // Europe/Paris goes back an hour on 2026-10-25.
  assert.equal(zonedTimeToUtc("2026-10-24", "09:00", "Europe/Paris").toISOString(), "2026-10-24T07:00:00.000Z")
  assert.equal(zonedTimeToUtc("2026-10-26", "09:00", "Europe/Paris").toISOString(), "2026-10-26T08:00:00.000Z")
})

test("one day's window, time ranges and walk-ins", () => {
  assert.deepEqual(dayWindow("2026-11-19", PP), { from: "2026-11-18T17:00:00.000Z", to: "2026-11-19T17:00:00.000Z" })
  assert.equal(timeRange({ starts_at: "2026-11-19T02:00:00Z", ends_at: "2026-11-19T02:30:00Z" }, PP), "09:00–09:30")
  assert.deepEqual(walkInTimes("2026-11-19", "09:00", 30, PP), {
    starts_at: "2026-11-19T02:00:00.000Z",
    ends_at: "2026-11-19T02:30:00.000Z",
  })
})

test("dates", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01")
  assert.equal(addDays("2026-03-01", -1), "2026-02-28")
  assert.equal(isDate("2026-11-19"), true)
  assert.equal(isDate("19/11/2026"), false)
  assert.equal(isDate(undefined), false)
  assert.equal(dayLabel("2026-11-19"), "Thu 19 Nov 2026")
})

test("zone in plain words, as the admin", () => {
  assert.equal(zoneLabel("Asia/Phnom_Penh"), "Phnom Penh time")
  assert.equal(zoneLabel("UTC"), "UTC time")
})
