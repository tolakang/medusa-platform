import { isStaffIdCommand, staffStartReply } from "../staff-bot"

describe("staff bot /start (TASKS P3-28 follow-up)", () => {
  it("answers /start and /id with the chat ID", () => {
    expect(isStaffIdCommand("/start")).toBe(true)
    expect(isStaffIdCommand("/start abc")).toBe(true)
    expect(isStaffIdCommand("/id@ShopStaffBot")).toBe(true)
    expect(isStaffIdCommand("hello")).toBe(false)
    expect(isStaffIdCommand("/startx")).toBe(false)
    expect(staffStartReply(555123)).toMatch(/^Your chat ID is 555123\./)
  })
})
