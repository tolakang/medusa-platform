import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

jest.setTimeout(120 * 1000)

// TASKS P3-28 follow-up: a person who sends /start to the staff bot privately
// gets their chat ID back; anything else, or a wrong secret, gets nothing.
medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("staff bot /start", () => {
      const call = (request: Promise<any>) =>
        request.then(
          (r) => r,
          (e) => e.response
        )
      const post = (body: unknown, secret = "s3cret") =>
        call(api.post("/telegram/staff-webhook", body, { headers: { "x-telegram-bot-api-secret-token": secret } }))
      const replies = async () =>
        (await getContainer().resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "notification", fields: ["to", "channel", "data"], filters: { channel: "telegram_staff" } })).data

      afterEach(() => {
        delete process.env.TELEGRAM_STAFF_WEBHOOK_SECRET
      })

      it("answers 404 until the secret is set, 401 for a wrong one", async () => {
        expect((await post({})).status).toBe(404)
        process.env.TELEGRAM_STAFF_WEBHOOK_SECRET = "s3cret"
        expect((await post({}, "wrong")).status).toBe(401)
      })

      it("replies to a private /start with the chat ID, and ignores the rest", async () => {
        process.env.TELEGRAM_STAFF_WEBHOOK_SECRET = "s3cret"
        expect((await post({ message: { text: "hello", chat: { id: 555123, type: "private" } } })).status).toBe(200)
        expect((await post({ message: { text: "/start", chat: { id: -1001, type: "group" } } })).status).toBe(200)
        expect(await replies()).toEqual([])
        expect((await post({ message: { text: "/start", chat: { id: 555123, type: "private" } } })).status).toBe(200)
        let sent: any[] = []
        for (let i = 0; i < 20 && !sent.length; i++) {
          sent = await replies()
          if (!sent.length) await new Promise((r) => setTimeout(r, 200))
        }
        expect(sent.map((n) => [n.to, n.data.text.split("\n")[0]])).toEqual([["555123", "Your chat ID is 555123."]])
      })
    })
  },
})
