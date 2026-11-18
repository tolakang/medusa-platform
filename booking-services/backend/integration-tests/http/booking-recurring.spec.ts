import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createDefaultsWorkflow, createShippingProfilesWorkflow } from "@medusajs/medusa/core-flows"
import jwt from "jsonwebtoken"
import { RECURRING_SERVICE_MESSAGE } from "../../src/lib/recurring"
import { BOOKING_MODULE } from "../../src/modules/booking"
import type BookingModuleService from "../../src/modules/booking/service"
import seed from "../../src/scripts/seed"
import seedBookingDemo from "../../src/scripts/seed-booking-demo"

jest.setTimeout(240 * 1000)

const monday = (() => {
  const d = new Date(Date.now() + 7 * 24 * 3600 * 1000)
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7))
  return d.toISOString().slice(0, 10)
})()

// TASKS P3-29: the same time every week into the cart at once; all weeks free
// or none added.
medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("recurring bookings (TASKS P3-29)", () => {
      let store: { headers: Record<string, string> }
      let admin: { headers: Record<string, string> }
      let regionId: string
      let haircut: string
      let productId: string
      const query = () => getContainer().resolve(ContainerRegistrationKeys.QUERY)
      const service = () => getContainer().resolve<BookingModuleService>(BOOKING_MODULE)
      const call = (request: Promise<any>) =>
        request.then(
          (r) => r,
          (e) => e.response
        )
      const customer = async (email: string) => {
        const container = getContainer()
        const c = await container.resolve(Modules.CUSTOMER).createCustomers({ email, first_name: "Sok", last_name: "chan" })
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
        } = await query().graph({ entity: "product", fields: ["id", "variants.id", "variants.title"], filters: { handle: "haircut" } })
        haircut = product.variants!.find((v) => v!.title === "30 min")!.id
        productId = product.id
        const email = "admin@booking.test"
        const user = await container.resolve(Modules.USER).createUsers({ email })
        await container.resolve(Modules.AUTH).createAuthIdentities({
          provider_identities: [{ provider: "emailpass", entity_id: email }],
          app_metadata: { user_id: user.id },
        })
        await container.resolve(Modules.AUTH).updateProvider("emailpass", { entity_id: email, password: "supersecret1" })
        admin = { headers: { authorization: `Bearer ${(await api.post("/auth/user/emailpass", { email, password: "supersecret1" })).data.token}` } }
      })

      const weekly = (who: any, cart: string, slot: any, weeks: number, variant = haircut) =>
        call(
          api.post(
            "/store/booking/recurring",
            { cart_id: cart, variant_id: variant, resource_id: slot.resource_id, starts_at: slot.starts_at, ends_at: slot.ends_at, weeks },
            who
          )
        )
      const plusWeeks = (iso: string, w: number) => new Date(Date.parse(iso) + w * 7 * 86_400_000).toISOString()

      it("books four weeks at the same time, each its own line, in one series", async () => {
        const sok = await customer("sok@example.com")
        const slot = (await slots())[0]
        const cart = (await api.post("/store/carts", { region_id: regionId }, sok)).data.cart.id
        const r = await weekly(sok, cart, slot, 4)
        expect(r.status).toBe(200)
        expect(r.data.bookings.map((b: any) => b.starts_at)).toEqual([0, 1, 2, 3].map((w) => plusWeeks(slot.starts_at, w)))
        const items = (await api.get(`/store/carts/${cart}`, sok)).data.cart.items
        expect(items.map((i: any) => [i.unit_price, i.metadata.booking_starts_at]).sort()).toEqual(
          [0, 1, 2, 3].map((w) => [8, plusWeeks(slot.starts_at, w)]).sort()
        )
        const { data: rows } = await query().graph({ entity: "booking", fields: ["series_id"], filters: { id: r.data.bookings.map((b: any) => b.id) } })
        expect(new Set(rows.map((b) => b.series_id)).size).toBe(1)
        expect(rows[0].series_id).toBe(r.data.series_id)

        // Paid in one checkout: all four confirmed.
        const {
          data: { payment_collection },
        } = await api.post("/store/payment-collections", { cart_id: cart }, sok)
        await api.post(`/store/payment-collections/${payment_collection.id}/payment-sessions`, { provider_id: "pp_system_default" }, sok)
        const done = await api.post(`/store/carts/${cart}/complete`, {}, sok)
        expect([done.data.type, done.data.order.total]).toEqual(["order", 32])
      })

      it("adds nothing when a week is taken, and says which", async () => {
        const sok = await customer("sok@example.com")
        const dara = await customer("dara@example.com")
        const slot = (await slots())[0]
        // Dara has week 3 of that time.
        const other = (await api.post("/store/carts", { region_id: regionId }, dara)).data.cart.id
        await api.post(
          "/store/booking/cart",
          { cart_id: other, variant_id: haircut, resource_id: slot.resource_id, starts_at: plusWeeks(slot.starts_at, 2), ends_at: plusWeeks(slot.ends_at, 2) },
          dara
        )
        const cart = (await api.post("/store/carts", { region_id: regionId }, sok)).data.cart.id
        const r = await weekly(sok, cart, slot, 4)
        expect([r.status, r.data.conflicts]).toEqual([400, [plusWeeks(slot.starts_at, 2)]])
        expect((await api.get(`/store/carts/${cart}`, sok)).data.cart.items).toEqual([])
      })

      it("refuses services that can't repeat and more than 12 weeks", async () => {
        const sok = await customer("sok@example.com")
        const cart = (await api.post("/store/carts", { region_id: regionId }, sok)).data.cart.id
        expect((await weekly(sok, cart, (await slots())[0], 13)).status).toBe(400)
        const {
          data: [truck],
        } = await query().graph({ entity: "product", fields: ["variants.id", "variants.booking_resources.id"], filters: { handle: "moving-truck" } })
        const v = truck.variants![0] as unknown as { id: string; booking_resources: { id: string }[] }
        const r = await weekly(sok, cart, { resource_id: v.booking_resources[0].id, starts_at: `${monday}T01:00:00.000Z`, ends_at: `${monday}T03:00:00.000Z` }, 2, v.id)
        expect([r.status, r.data.message]).toEqual([400, RECURRING_SERVICE_MESSAGE])
      })
    })
  },
})
