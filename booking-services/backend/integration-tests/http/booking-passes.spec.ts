import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createDefaultsWorkflow, createShippingProfilesWorkflow } from "@medusajs/medusa/core-flows"
import jwt from "jsonwebtoken"
import { PASS_EMPTY_MESSAGE, PASS_SERVICE_MESSAGE } from "../../src/lib/passes"
import { cancelBookingWorkflow } from "../../src/workflows/cancel-booking"
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

// TASKS P3-29: a customer buys a pass (credits for a service), books with it
// at $0, and gets the credit back when cancelling within the policy.
medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("passes (TASKS P3-29)", () => {
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

      // Buy the 5-pack and wait for the pass.
      const buyPass = async (who: any) => {
        const {
          data: [p],
        } = await query().graph({ entity: "product", fields: ["variants.id"], filters: { handle: "haircut-5-pack" } })
        const cart = (await api.post("/store/carts", { region_id: regionId }, who)).data.cart.id
        await api.post(`/store/carts/${cart}/line-items`, { variant_id: p.variants![0]!.id, quantity: 1 }, who)
        const {
          data: { payment_collection },
        } = await api.post("/store/payment-collections", { cart_id: cart }, who)
        await api.post(`/store/payment-collections/${payment_collection.id}/payment-sessions`, { provider_id: "pp_system_default" }, who)
        const done = await api.post(`/store/carts/${cart}/complete`, {}, who)
        expect([done.data.type, done.data.order.total]).toEqual(["order", 32])
        let passes: any[] = []
        for (let i = 0; i < 40 && !passes.length; i++) {
          passes = (await api.get("/store/booking/passes", who)).data.passes
          if (!passes.length) await new Promise((r) => setTimeout(r, 250))
        }
        return passes[0]
      }
      const bookWithPass = async (who: any, passId: string, slot: any) => {
        const cart = (await api.post("/store/carts", { region_id: regionId }, who)).data.cart.id
        const added = await call(
          api.post(
            "/store/booking/cart",
            { cart_id: cart, variant_id: haircut, resource_id: slot.resource_id, starts_at: slot.starts_at, ends_at: slot.ends_at, pass_id: passId },
            who
          )
        )
        return { cart, added }
      }
      const checkout = async (who: any, cart: string) => {
        const {
          data: { payment_collection },
        } = await api.post("/store/payment-collections", { cart_id: cart }, who)
        await api.post(`/store/payment-collections/${payment_collection.id}/payment-sessions`, { provider_id: "pp_system_default" }, who)
        return call(api.post(`/store/carts/${cart}/complete`, {}, who))
      }
      const creditsLeft = async (who: any, want: number) => {
        let left = -1
        for (let i = 0; i < 40 && left !== want; i++) {
          left = (await api.get("/store/booking/passes", who)).data.passes[0].credits_left
          if (left !== want) await new Promise((r) => setTimeout(r, 250))
        }
        return left
      }

      it("buys a pass, books at $0 with a credit, and gets it back on an early cancel", async () => {
        const sok = await customer("sok@example.com")
        expect((await call(api.get("/store/booking/passes", store))).status).toBe(401)
        const pass = await buyPass(sok)
        expect(pass).toMatchObject({ title: "Haircut 5-pack", credits_total: 5, credits_left: 5, covers: [{ handle: "haircut", title: "Haircut" }] })
        // Staff see it in the admin (P3-29 follow-up).
        const listed = (await api.get("/admin/booking/passes", admin)).data.passes
        expect(listed.map((p: any) => [p.title, p.credits_left, p.credits_total, p.customer.email, typeof p.order_display_id])).toEqual([
          ["Haircut 5-pack", 5, 5, "sok@example.com", "number"],
        ])
        const days = (Date.parse(pass.expires_at) - Date.now()) / 86_400_000
        expect(days > 179 && days <= 180).toBe(true)

        // Staff can't go above the total; they can set credits and end it (gap review 2026-11-24).
        const passId = listed[0].id
        expect((await call(api.post(`/admin/booking/passes/${passId}`, { credits_left: 6 }, admin))).status).toBe(400)
        expect((await call(api.post(`/admin/booking/passes/${passId}`, { credits_left: 4 }, admin))).data.pass.credits_left).toBe(4)
        await api.post(`/admin/booking/passes/${passId}`, { credits_left: 5 }, admin)

        const free = await slots()
        const { cart, added } = await bookWithPass(sok, pass.id, free[0])
        expect(added.status).toBe(200)
        const line = (await api.get(`/store/carts/${cart}`, sok)).data.cart.items[0]
        expect([line.unit_price, line.metadata.booking_pass_id]).toEqual([0, pass.id])
        // A $0 cart completes with no payment collection at all, as the
        // storefront does (core-flows validateCartPaymentsStep skips payment
        // when total <= 0 and credit_line_total >= 0).
        const done = await call(api.post(`/store/carts/${cart}/complete`, {}, sok))
        expect([done.data.type, done.data.order.total]).toEqual(["order", 0])
        expect(await creditsLeft(sok, 4)).toBe(4)
        const bookingId = line.metadata.booking_id

        // Cancelled a week ahead (within the policy): the credit comes back.
        await cancelBookingWorkflow(getContainer()).run({ input: { booking_id: bookingId } })
        expect(await creditsLeft(sok, 5)).toBe(5)
        // Not twice.
        await call(cancelBookingWorkflow(getContainer()).run({ input: { booking_id: bookingId } }))
        expect((await api.get("/store/booking/passes", sok)).data.passes[0].credits_left).toBe(5)
      })

      it("takes a credit per seat on a departure, and gives credits back when staff cancel late", async () => {
        const sok = await customer("sok@example.com")
        const {
          data: [bus],
        } = await query().graph({ entity: "product", fields: ["id", "variants.id", "variants.booking_resources.id"], filters: { handle: "bus-siem-reap-phnom-penh" } })
        const {
          data: [cust],
        } = await query().graph({ entity: "customer", fields: ["id"], filters: { email: "sok@example.com" } })
        const pass = await service().createBookingPasses({
          customer_id: cust.id,
          order_id: "order_test",
          line_item_id: "li_test_bus",
          product_id: bus.id,
          title: "Bus 5-ride pass",
          credits_total: 5,
          credits_left: 5,
          expires_at: new Date(Date.now() + 90 * 86_400_000),
          product_ids: [bus.id] as unknown as Record<string, unknown>,
        })
        const v = bus.variants![0] as unknown as { id: string; booking_resources: { id: string }[] }
        const { data: dep } = await api.get(`/store/booking/slots?variant_id=${v.id}&date=${monday}`, store)
        const s = dep.slots[0]
        const cart = (await api.post("/store/carts", { region_id: regionId }, sok)).data.cart.id
        const added = await call(
          api.post("/store/booking/cart", { cart_id: cart, variant_id: v.id, resource_id: s.resource_id, starts_at: s.starts_at, ends_at: s.ends_at, seats: 3, pass_id: pass.id }, sok)
        )
        expect(added.status).toBe(200)
        const line = (await api.get(`/store/carts/${cart}`, sok)).data.cart.items[0]
        expect([line.unit_price, line.metadata.booking_pass_credits]).toEqual([0, 3])
        const done = await checkout(sok, cart)
        expect(done.data.order.total).toBe(0)
        expect(await creditsLeft(sok, 2)).toBe(2)

        // Staff cancel it an hour before (outside the policy): the shop's own
        // cancel gives the 3 credits back.
        const soon = new Date(Date.now() + 3600_000)
        await service().updateBookings({ id: line.metadata.booking_id, starts_at: soon, ends_at: new Date(soon.getTime() + 3600_000) })
        await cancelBookingWorkflow(getContainer()).run({ input: { booking_id: line.metadata.booking_id } })
        expect(await creditsLeft(sok, 5)).toBe(5)
      })

      it("never lets two orders spend the same last credit (review finding)", async () => {
        const sok = await customer("sok@example.com")
        const pass = await buyPass(sok)
        await service().updateBookingPasses({ id: pass.id, credits_left: 1 })
        const free = await slots()
        // Two carts each pass their own check with the one credit...
        const a = await bookWithPass(sok, pass.id, free[0])
        const b = await bookWithPass(sok, pass.id, free[2])
        expect([a.added.status, b.added.status]).toEqual([200, 200])
        await checkout(sok, a.cart)
        await checkout(sok, b.cart)
        // ...but only one booking is paid by it: the other is refused at
        // checkout (if the credit was taken by then) or cancelled after its
        // order (if both checked out together); never confirmed for free.
        let statuses: string[] = []
        for (let i = 0; i < 40; i++) {
          const ids = [a.added.data.booking.id, b.added.data.booking.id]
          statuses = (await query().graph({ entity: "booking", fields: ["status"], filters: { id: ids } })).data.map((x) => x.status)
          if (statuses.includes("confirmed") && !statuses.every((x) => x === "confirmed")) break
          await new Promise((r) => setTimeout(r, 250))
        }
        expect(statuses.filter((x) => x === "confirmed")).toHaveLength(1)
        // The take itself is atomic: two at once on one credit, one wins.
        await service().updateBookingPasses({ id: pass.id, credits_left: 1 })
        const both = await Promise.all([
          service().takePassCredits({ pass_id: pass.id, credits: 1 }),
          service().takePassCredits({ pass_id: pass.id, credits: 1 }),
        ])
        expect(both.filter(Boolean)).toHaveLength(1)
        expect((await api.get("/store/booking/passes", sok)).data.passes[0].credits_left).toBe(0)
      })

      it("refuses someone else's pass, another service, and more bookings than credits", async () => {
        const sok = await customer("sok@example.com")
        const pass = await buyPass(sok)
        const dara = await customer("dara@example.com")
        expect((await bookWithPass(dara, pass.id, (await slots())[0])).added.status).toBe(404)

        // Air conditioner service isn't covered.
        const {
          data: [ac],
        } = await query().graph({ entity: "product", fields: ["variants.id", "variants.booking_resources.id"], filters: { handle: "air-conditioner-service" } })
        const v = ac.variants![0] as unknown as { id: string; booking_resources: { id: string }[] }
        const acSlots = (await api.get(`/store/booking/slots?variant_id=${v.id}&date=${monday}`, store)).data.slots
        const cart = (await api.post("/store/carts", { region_id: regionId }, sok)).data.cart.id
        const other = await call(
          api.post(
            "/store/booking/cart",
            { cart_id: cart, variant_id: v.id, resource_id: acSlots[0].resource_id, starts_at: acSlots[0].starts_at, ends_at: acSlots[0].ends_at, address: "#12, St 310", notes: "Leaking", pass_id: pass.id },
            sok
          )
        )
        expect([other.status, other.data.message]).toEqual([400, PASS_SERVICE_MESSAGE])

        // Only 4 credits left: a fifth booking in the same cart is refused.
        await service().updateBookingPasses({ id: pass.id, credits_left: 1 })
        const free = await slots()
        const first = await bookWithPass(sok, pass.id, free[0])
        expect(first.added.status).toBe(200)
        const second = await call(
          api.post(
            "/store/booking/cart",
            { cart_id: first.cart, variant_id: haircut, resource_id: free[2].resource_id, starts_at: free[2].starts_at, ends_at: free[2].ends_at, pass_id: pass.id },
            sok
          )
        )
        expect([second.status, second.data.message]).toEqual([400, PASS_EMPTY_MESSAGE])
        // The last credit is used by another cart before checkout: refused there.
        await service().updateBookingPasses({ id: pass.id, credits_left: 0 })
        const late = await checkout(sok, first.cart)
        expect(late.status).toBe(400)
      })
    })
  },
})
