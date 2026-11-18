import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createDefaultsWorkflow, createShippingProfilesWorkflow } from "@medusajs/medusa/core-flows"
import jwt from "jsonwebtoken"
import { BOOKING_MOVED_TEMPLATE, MOVE_LENGTH_MESSAGE, MOVE_SERVICE_MESSAGE, MOVE_TOO_LATE_MESSAGE } from "../../src/lib/booking-move"
import { BOOKING_MODULE } from "../../src/modules/booking"
import type BookingModuleService from "../../src/modules/booking/service"
import seed from "../../src/scripts/seed"
import seedBookingDemo from "../../src/scripts/seed-booking-demo"
import { createBookingResourceWorkflow } from "../../src/workflows/booking-resource"

jest.setTimeout(240 * 1000)

const monday = (() => {
  const d = new Date(Date.now() + 7 * 24 * 3600 * 1000)
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7))
  return d.toISOString().slice(0, 10)
})()

// TASKS P3-28 (owner, 2026-11-18: "follow your recommendation"): the customer
// moves a confirmed booking to another free time of the same length until the
// cancellation cutoff; staff assign it to another calendar offering the
// service, or another time, until it ends.
medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("move a booking (TASKS P3-28)", () => {
      let store: { headers: Record<string, string> }
      let admin: { headers: Record<string, string> }
      let regionId: string
      let haircut: string
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
      const slots = async () => (await api.get(`/store/booking/slots?variant_id=${haircut}&date=${monday}`, store)).data.slots
      // Notifications sent so far by template, waited for (subscribers run after the response).
      const sent = async (template: string, count: number) => {
        let rows: any[] = []
        for (let i = 0; i < 40 && rows.length < count; i++) {
          rows = (await query().graph({ entity: "notification", fields: ["to", "channel", "data"], filters: { template } })).data
          if (rows.length < count) await new Promise((r) => setTimeout(r, 250))
        }
        return rows
      }
      // Book and pay a slot; returns the confirmed booking id.
      const bookAndPay = async (who: { headers: Record<string, string> }, slot: any) => {
        const cart = (await api.post("/store/carts", { region_id: regionId }, who)).data.cart.id
        const { data } = await api.post(
          "/store/booking/cart",
          { cart_id: cart, variant_id: haircut, resource_id: slot.resource_id, starts_at: slot.starts_at, ends_at: slot.ends_at },
          who
        )
        const {
          data: { payment_collection },
        } = await api.post("/store/payment-collections", { cart_id: cart }, who)
        await api.post(`/store/payment-collections/${payment_collection.id}/payment-sessions`, { provider_id: "pp_system_default" }, who)
        await api.post(`/store/carts/${cart}/complete`, {}, who)
        for (let i = 0; i < 40; i++) {
          if ((await service().retrieveBooking(data.booking.id)).status === "confirmed") break
          await new Promise((r) => setTimeout(r, 250))
        }
        return data.booking.id as string
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
        regionId = (await query().graph({ entity: "region", fields: ["id"] })).data[0].id
        const {
          data: [product],
        } = await query().graph({ entity: "product", fields: ["variants.id", "variants.title"], filters: { handle: "haircut" } })
        haircut = product.variants!.find((v) => v!.title === "30 min")!.id
        const email = "admin@booking.test"
        const user = await container.resolve(Modules.USER).createUsers({ email })
        await container.resolve(Modules.AUTH).createAuthIdentities({
          provider_identities: [{ provider: "emailpass", entity_id: email }],
          app_metadata: { user_id: user.id },
        })
        await container.resolve(Modules.AUTH).updateProvider("emailpass", { entity_id: email, password: "supersecret1" })
        admin = { headers: { authorization: `Bearer ${(await api.post("/auth/user/emailpass", { email, password: "supersecret1" })).data.token}` } }
      })

      it("lets the customer move their booking to a free time of the same length", async () => {
        const sok = await customer("sok@example.com")
        const free = await slots()
        const id = await bookAndPay(sok, free[0])
        await service().updateBookings({ id, reminder_sent_at: new Date() })

        const mine = (await api.get("/store/customers/me/bookings", sok)).data.bookings
        expect(mine.map((b: any) => [b.id, b.status, b.variant_id])).toEqual([[id, "confirmed", haircut]])

        // Another customer has the next slot: it can't be taken.
        const dara = await customer("dara@example.com")
        await bookAndPay(dara, free[1])
        const taken = await call(api.post("/store/booking/move", { booking_id: id, ...pick(free[1]) }, sok))
        expect(taken.status).toBe(400)
        // Not theirs.
        expect((await call(api.post("/store/booking/move", { booking_id: id, ...pick(free[3]) }, dara))).status).toBe(404)
        // A different length.
        const long = { ...pick(free[3]), ends_at: new Date(Date.parse(free[3].starts_at) + 3600_000).toISOString() }
        const wrong = await call(api.post("/store/booking/move", { booking_id: id, ...long }, sok))
        expect([wrong.status, wrong.data.message]).toEqual([400, MOVE_LENGTH_MESSAGE])

        const moved = await api.post("/store/booking/move", { booking_id: id, ...pick(free[3]) }, sok)
        expect([moved.data.booking.starts_at, moved.data.booking.ends_at]).toEqual([free[3].starts_at, free[3].ends_at])
        const after = await service().retrieveBooking(id)
        expect([after.status, after.reminder_sent_at]).toEqual(["confirmed", null])
        // The old time is free again.
        expect((await slots()).map((s: any) => s.starts_at)).toContain(free[0].starts_at)
      })

      it("refuses a customer move inside the cancellation cutoff", async () => {
        const sok = await customer("sok@example.com")
        const free = await slots()
        const id = await bookAndPay(sok, free[0])
        const soon = new Date(Date.now() + 2 * 3600_000)
        await service().updateBookings({ id, starts_at: soon, ends_at: new Date(soon.getTime() + 30 * 60_000) })
        const r = await call(api.post("/store/booking/move", { booking_id: id, ...pick(free[2]) }, sok))
        expect([r.status, r.data.message]).toEqual([400, MOVE_TOO_LATE_MESSAGE])
      })

      it("lets staff assign the booking to another calendar that offers the service", async () => {
        const sok = await customer("sok@example.com")
        const free = await slots()
        const id = await bookAndPay(sok, free[0])
        const { result: dara } = await createBookingResourceWorkflow(getContainer()).run({
          input: {
            name: "Dara",
            type: "staff",
            timezone: "Asia/Phnom_Penh",
            schedules: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start_time: "08:00", end_time: "20:00" })),
            variant_ids: [haircut],
          },
        })
        // A new booking's job went to the staff group, with whose calendar it is.
        const [first] = await sent("telegram-text", 1)
        expect([first.to, first.channel]).toEqual(["staff", "telegram"])
        expect(first.data.text).toMatch(/^👤 Sophea\n🗓 New job: Haircut\n/)

        // Dara gets jobs in their own chat with the staff bot.
        await api.post(`/admin/booking/resources/${dara.id}`, { telegram_chat_id: "555123" }, admin)
        const moved = await api.post(`/admin/booking/bookings/${id}/move`, { resource_id: dara.id }, admin)
        const jobs = await sent("telegram-text", 3)
        expect(jobs.slice(1).map((n: any) => [n.to, n.channel, n.data.text.split("\n")[0]]).sort()).toEqual([
          ["555123", "telegram_staff", "🔁 Job moved: Haircut"],
          ["staff", "telegram", "👤 Sophea"],
        ])
        expect(jobs.find((n: any) => n.to === "staff" && n.data.text.includes("taken off"))).toBeTruthy()
        // The customer is emailed when staff move it.
        const [email] = await sent(BOOKING_MOVED_TEMPLATE, 1)
        expect([email.to, email.channel, email.data.calendar]).toEqual(["sok@example.com", "email", "Dara"])
        expect(moved.data.booking.starts_at).toBe(free[0].starts_at)
        expect((await query().graph({ entity: "booking", fields: ["resource.name"], filters: { id } })).data[0].resource!.name).toBe("Dara")

        // A calendar that doesn't offer haircuts.
        const {
          data: [crew],
        } = await query().graph({ entity: "booking_resource", fields: ["id"], filters: { name: "Moving crew" } })
        const wrong = await call(api.post(`/admin/booking/bookings/${id}/move`, { resource_id: crew.id }, admin))
        expect([wrong.status, wrong.data.message]).toEqual([400, MOVE_SERVICE_MESSAGE])
        // Staff are not held to the cutoff: an hour earlier on Dara's calendar.
        const earlier = new Date(Date.parse(free[0].starts_at) - 3600_000).toISOString()
        expect((await api.post(`/admin/booking/bookings/${id}/move`, { starts_at: earlier }, admin)).data.booking.starts_at).toBe(earlier)
      })
    })
  },
})

const pick = (s: { resource_id: string; starts_at: string; ends_at: string }) => ({
  resource_id: s.resource_id,
  starts_at: s.starts_at,
  ends_at: s.ends_at,
})
