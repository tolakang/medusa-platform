import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createDefaultsWorkflow, createShippingProfilesWorkflow } from "@medusajs/medusa/core-flows"
import jwt from "jsonwebtoken"
import { WAITLIST_FREE_MESSAGE, WAITLIST_SERVICE_MESSAGE, WAITLIST_TEMPLATE } from "../../src/lib/waitlist"
import { BOOKING_MODULE } from "../../src/modules/booking"
import type BookingModuleService from "../../src/modules/booking/service"
import seed from "../../src/scripts/seed"
import seedBookingDemo from "../../src/scripts/seed-booking-demo"
import { notifyWaitlistWorkflow } from "../../src/workflows/booking-waitlist"

jest.setTimeout(240 * 1000)

const monday = (() => {
  const d = new Date(Date.now() + 7 * 24 * 3600 * 1000)
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7))
  return d.toISOString().slice(0, 10)
})()

// TASKS P3-29: a customer waits for a full day; when a time frees up the job
// emails everyone waiting, once.
medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("waitlist (TASKS P3-29)", () => {
      let store: { headers: Record<string, string> }
      let admin: { headers: Record<string, string> }
      let haircut: string
      let stylist: string
      const query = () => getContainer().resolve(ContainerRegistrationKeys.QUERY)
      const service = () => getContainer().resolve<BookingModuleService>(BOOKING_MODULE)
      const call = (request: Promise<any>) =>
        request.then(
          (r) => r,
          (e) => e.response
        )
      const customer = async (email: string) => {
        const container = getContainer()
        const c = await container.resolve(Modules.CUSTOMER).createCustomers({ email })
        const identity = await container.resolve(Modules.AUTH).createAuthIdentities({
          provider_identities: [{ provider: "emailpass", entity_id: email }],
          app_metadata: { customer_id: c.id },
        })
        const token = jwt.sign({ actor_id: c.id, actor_type: "customer", auth_identity_id: identity.id }, "supersecret", { expiresIn: "1d" })
        return { headers: { ...store.headers, authorization: `Bearer ${token}` } }
      }

      beforeEach(async () => {
        const container = getContainer()
        process.env.BOOKING_DEFAULT_TIMEZONE = "Asia/Phnom_Penh"
        await createShippingProfilesWorkflow(container).run({ input: { data: [{ name: "Default Shipping Profile", type: "default" }] } })
        await createDefaultsWorkflow(container).run()
        await seed({ container })
        await seedBookingDemo({ container })
        const {
          data: [key],
        } = await query().graph({ entity: "api_key", fields: ["token"], filters: { type: "publishable" } })
        store = { headers: { "x-publishable-api-key": key.token } }
        const {
          data: [product],
        } = await query().graph({ entity: "product", fields: ["variants.id", "variants.title", "variants.booking_resources.id"], filters: { handle: "haircut" } })
        const v = product.variants!.find((x) => x!.title === "30 min")! as unknown as { id: string; booking_resources: { id: string }[] }
        haircut = v.id
        stylist = v.booking_resources[0].id
        const email = "admin@booking.test"
        const user = await container.resolve(Modules.USER).createUsers({ email })
        await container.resolve(Modules.AUTH).createAuthIdentities({
          provider_identities: [{ provider: "emailpass", entity_id: email }],
          app_metadata: { user_id: user.id },
        })
        await container.resolve(Modules.AUTH).updateProvider("emailpass", { entity_id: email, password: "supersecret1" })
        admin = { headers: { authorization: `Bearer ${(await api.post("/auth/user/emailpass", { email, password: "supersecret1" })).data.token}` } }
      })

      it("waits for a full day and emails everyone once when a time frees up", async () => {
        const sok = await customer("sok@example.com")
        const dara = await customer("dara@example.com")
        expect((await call(api.get("/store/booking/waitlist", store))).status).toBe(401)
        // The day has free times: book one instead.
        const open = await call(api.post("/store/booking/waitlist", { variant_id: haircut, date: monday }, sok))
        expect([open.status, open.data.message]).toEqual([400, WAITLIST_FREE_MESSAGE])

        // The stylist is off that day: it's full.
        const off = await service().createBookingDayOffs({ resource_id: stylist, date: monday })
        const first = await api.post("/store/booking/waitlist", { variant_id: haircut, date: monday }, sok)
        const again = await api.post("/store/booking/waitlist", { variant_id: haircut, date: monday }, sok)
        expect(again.data.waitlist.id).toBe(first.data.waitlist.id)
        await api.post("/store/booking/waitlist", { variant_id: haircut, date: monday }, dara)
        const mine = (await api.get("/store/booking/waitlist", sok)).data.waitlist
        expect(mine.map((w: any) => [w.date, w.status, w.service, w.handle])).toEqual([[monday, "waiting", "Haircut", "haircut"]])

        // Staff see both waiting (P3-29 follow-up).
        const staffView = (await api.get("/admin/booking/waitlist", admin)).data.waitlist
        expect(staffView.map((w: any) => [w.date, w.service, w.status, w.customer.email]).sort()).toEqual(
          [
            [monday, "Haircut (30 min)", "waiting", "dara@example.com"],
            [monday, "Haircut (30 min)", "waiting", "sok@example.com"],
          ]
        )

        // Still full: nothing sent.
        expect((await notifyWaitlistWorkflow(getContainer()).run({ input: {} })).result).toEqual([])

        // Dara leaves; the day off is removed: Sok is emailed once.
        const daraEntry = (await api.get("/store/booking/waitlist", dara)).data.waitlist[0]
        await api.post(`/store/booking/waitlist/${daraEntry.id}/leave`, {}, dara)
        expect((await api.get("/store/booking/waitlist", dara)).data.waitlist).toEqual([])
        await service().deleteBookingDayOffs(off.id)
        const sent = (await notifyWaitlistWorkflow(getContainer()).run({ input: {} })).result
        expect(sent.map((n) => [n.to, n.data.service, n.data.date, n.data.times[0]])).toEqual([["sok@example.com", "Haircut", monday, "09:00"]])
        expect((await notifyWaitlistWorkflow(getContainer()).run({ input: {} })).result).toEqual([])
        const { data: emails } = await query().graph({ entity: "notification", fields: ["to"], filters: { template: WAITLIST_TEMPLATE } })
        expect(emails.map((e) => e.to)).toEqual(["sok@example.com"])
        expect((await api.get("/store/booking/waitlist", sok)).data.waitlist[0].status).toBe("notified")
        // Another customer can't leave Sok's entry.
        expect((await call(api.post(`/store/booking/waitlist/${first.data.waitlist.id}/leave`, {}, dara))).status).toBe(404)
      })

      it("refuses services with their own availability and days in the past", async () => {
        const sok = await customer("sok@example.com")
        const {
          data: [room],
        } = await query().graph({ entity: "product", fields: ["variants.id"], filters: { handle: "guesthouse-room" } })
        const rental = await call(api.post("/store/booking/waitlist", { variant_id: room.variants![0]!.id, date: monday }, sok))
        expect([rental.status, rental.data.message]).toEqual([400, WAITLIST_SERVICE_MESSAGE])
        const past = await call(api.post("/store/booking/waitlist", { variant_id: haircut, date: "2020-01-06" }, sok))
        expect(past.status).toBe(400)
      })
    })
  },
})
