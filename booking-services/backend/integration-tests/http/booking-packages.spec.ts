import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { capturePaymentWorkflow, createDefaultsWorkflow, createShippingProfilesWorkflow } from "@medusajs/medusa/core-flows"
import { PACKAGE_PIECE_CANCEL_MESSAGE } from "../../src/workflows/cancel-booking"
import { sendBalanceRemindersWorkflow } from "../../src/workflows/send-balance-reminders"
import jwt from "jsonwebtoken"
import { PACKAGE_ALONE_MESSAGE, PACKAGE_CHOICE_MESSAGE, PACKAGE_INCOMPLETE_MESSAGE } from "../../src/lib/packages"
import { zonedTimeToUtc } from "../../src/modules/booking/utils/slot"
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

// TASKS P3-30 (kind H): an event package's pieces go into the cart together
// on its date, or none; checkout confirms them together, at the package price.
medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("event packages (TASKS P3-30)", () => {
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

      const pkgVariant = async () => {
        const {
          data: [p],
        } = await query().graph({ entity: "product", fields: ["variants.id"], filters: { handle: "small-wedding" } })
        return p.variants![0]!.id
      }
      const book = async (who: any, cart: string, date = monday) =>
        call(api.post("/store/booking/package", { cart_id: cart, variant_id: await pkgVariant(), date }, who))
      const lines = async (who: any, cart: string) => (await api.get(`/store/carts/${cart}`, who)).data.cart.items as any[]

      it("puts the package and all its pieces in the cart, and confirms them together", async () => {
        const sok = await customer("sok@example.com")
        const cart = (await api.post("/store/carts", { region_id: regionId }, sok)).data.cart.id
        const r = await book(sok, cart)
        expect(r.status).toBe(200)
        const items = await lines(sok, cart)
        expect(items.map((i) => [i.product_title, i.unit_price]).sort()).toEqual(
          [["Haircut", 0], ["Small wedding", 150], ["Table reservation", 0], ["Wedding tent", 0]].sort()
        )
        expect(new Set(items.map((i) => i.metadata.booking_package_id))).toEqual(new Set([r.data.package_id]))
        // Hair at 09:00 local on the day.
        const hair = items.find((i) => i.product_title === "Haircut")
        expect(hair.metadata.booking_starts_at).toBe(zonedTimeToUtc(monday, "09:00", "Asia/Phnom_Penh").toISOString())

        const {
          data: { payment_collection },
        } = await api.post("/store/payment-collections", { cart_id: cart }, sok)
        const session = await api.post(`/store/payment-collections/${payment_collection.id}/payment-sessions`, { provider_id: "pp_system_default" }, sok)
        // The payment plan: 30% at checkout.
        expect(Number(session.data.payment_collection.amount)).toBe(45)
        const done = await api.post(`/store/carts/${cart}/complete`, {}, sok)
        expect([done.data.type, done.data.order.total]).toEqual(["order", 150])
        let rows: any[] = []
        for (let i = 0; i < 40; i++) {
          rows = (await query().graph({ entity: "booking", fields: ["status", "package_id"], filters: { package_id: r.data.package_id } })).data
          if (rows.length === 3 && rows.every((b) => b.status === "confirmed")) break
          await new Promise((res) => setTimeout(res, 250))
        }
        expect(rows.map((b) => b.status)).toEqual(["confirmed", "confirmed", "confirmed"])

        // The rest as two instalments: 40% a month before (already past:
        // due now) and 30% a week before the first piece, never after it.
        let balances: any[] = []
        for (let i = 0; i < 40 && balances.length < 2; i++) {
          const { data } = await query().graph({
            entity: "order",
            fields: ["payment_collections.amount", "payment_collections.status", "payment_collections.metadata"],
            filters: { id: done.data.order.id },
          })
          balances = (data[0].payment_collections ?? []).filter((c: any) => c?.metadata?.booking_balance)
          if (balances.length < 2) await new Promise((res) => setTimeout(res, 250))
        }
        balances.sort((a, b) => a.metadata.instalment - b.metadata.instalment)
        expect(balances.map((c) => [Number(c.amount), c.status, c.metadata.instalment])).toEqual([
          [60, "not_paid", 2],
          [45, "not_paid", 3],
        ])
        const firstPiece = zonedTimeToUtc(monday, "00:00", "Asia/Phnom_Penh").getTime()
        expect(Date.parse(balances[0].metadata.due_at)).toBeLessThanOrEqual(Date.parse(balances[1].metadata.due_at))
        expect(Date.parse(balances[1].metadata.due_at)).toBeLessThanOrEqual(firstPiece)
      })

      // Book and pay the package on monday; returns its id, the order and payment.
      const payPackage = async (who: any) => {
        const cart = (await api.post("/store/carts", { region_id: regionId }, who)).data.cart.id
        const r = await book(who, cart)
        const {
          data: { payment_collection },
        } = await api.post("/store/payment-collections", { cart_id: cart }, who)
        await api.post(`/store/payment-collections/${payment_collection.id}/payment-sessions`, { provider_id: "pp_system_default" }, who)
        const done = await api.post(`/store/carts/${cart}/complete`, {}, who)
        let rows: any[] = []
        for (let i = 0; i < 40; i++) {
          rows = (await query().graph({ entity: "booking", fields: ["id", "status"], filters: { package_id: r.data.package_id } })).data
          if (rows.length === 3 && rows.every((b) => b.status === "confirmed")) break
          await new Promise((res) => setTimeout(res, 250))
        }
        const {
          data: [order],
        } = await query().graph({ entity: "order", fields: ["payment_collections.payments.id"], filters: { id: done.data.order.id } })
        return { id: r.data.package_id as string, pieces: rows.map((b) => b.id), payment: order.payment_collections![0]!.payments![0]!.id }
      }

      it("shows the event with its pieces in the admin, and cancels it whole with a refund", async () => {
        const sok = await customer("sok@example.com")
        const pkg = await payPackage(sok)
        await capturePaymentWorkflow(getContainer()).run({ input: { payment_id: pkg.payment } })

        const events = (await api.get("/admin/booking/events", admin)).data.events
        expect(events.map((e: any) => [e.id, e.title, e.event_date, e.status, e.order.email, e.pieces.length])).toEqual([
          [pkg.id, "Small wedding", monday, "confirmed", "sok@example.com", 3],
        ])
        // Soonest first: the tent from midnight, hair at 09:00, the table at 18:00.
        expect(events[0].pieces.map((p: any) => [p.title, p.resource])).toEqual([
          ["Wedding tent (50 guests)", "Wedding tent: 50 guests"],
          ["Haircut (60 min)", "Sophea"],
          ["Table reservation (6 people)", "Table for 6"],
        ])

        // The customer can't cancel one piece alone.
        const one = await call(api.post("/store/booking/cancel", { booking_id: pkg.pieces[0] }, sok))
        expect([one.status, one.data.message]).toEqual([400, PACKAGE_PIECE_CANCEL_MESSAGE])
        // Another customer can't cancel it.
        const dara = await customer("dara@example.com")
        expect((await call(api.post(`/store/booking/package/${pkg.id}/cancel`, {}, dara))).status).toBe(404)

        // A week ahead: all cancelled, the package's $150 refunded.
        const done = await api.post(`/store/booking/package/${pkg.id}/cancel`, {}, sok)
        // Paid so far: the plan's first 30% ($45), refunded in full.
        expect(done.data).toEqual({ cancelled: 3, refund: "refunded", refunded_amount: 45 })
        // The instalments left aren't chased any more: a day before the
        // later instalment is due, no reminder goes out.
        const { data: cols } = await query().graph({ entity: "payment_collection", fields: ["metadata"], filters: { status: "not_paid" } })
        const later = cols.map((c: any) => c.metadata?.due_at).filter(Boolean).sort().pop()
        const reminders = await sendBalanceRemindersWorkflow(getContainer()).run({
          input: { now: new Date(Date.parse(later) - 86_400_000).toISOString() },
        })
        expect(reminders.result).toEqual([])
        const { data: rows } = await query().graph({ entity: "booking", fields: ["status"], filters: { package_id: pkg.id } })
        expect(rows.map((b) => b.status)).toEqual(["cancelled", "cancelled", "cancelled"])
        expect((await call(api.post(`/admin/booking/events/${pkg.id}/cancel`, {}, admin))).status).toBe(404)
      })

      it("lets staff cancel an event from the admin", async () => {
        const sok = await customer("sok@example.com")
        const pkg = await payPackage(sok)
        const done = await api.post(`/admin/booking/events/${pkg.id}/cancel`, {}, admin)
        // Not captured yet: nothing to refund.
        expect(done.data).toEqual({ cancelled: 3, refund: "not_captured", refunded_amount: 0 })
        expect((await api.get("/admin/booking/events", admin)).data.events[0].status).toBe("cancelled")
      })

      it("books the pieces chosen à la carte at their own prices, together", async () => {
        const sok = await customer("sok@example.com")
        const {
          data: [p],
        } = await query().graph({ entity: "product", fields: ["variants.id"], filters: { handle: "build-your-event" } })
        const variant = p.variants![0]!.id
        const cart = (await api.post("/store/carts", { region_id: regionId }, sok)).data.cart.id
        const choose = (choices: number[]) => call(api.post("/store/booking/package", { cart_id: cart, variant_id: variant, date: monday, choices }, sok))
        expect([(await choose([])).status, (await choose([])).data.message]).toEqual([400, PACKAGE_CHOICE_MESSAGE])
        expect((await choose([9])).status).toBe(400)

        // Hair and the dinner table.
        expect((await choose([0, 3])).status).toBe(200)
        const items = await lines(sok, cart)
        expect(items.map((i) => [i.product_title, i.unit_price]).sort()).toEqual(
          [["Build your event", 0], ["Haircut", 15], ["Table reservation", 5]].sort()
        )
        const head = items.find((i) => i.product_title === "Build your event")
        expect(head.metadata.booking_package_pieces).toBe(2)
        // The package line can't be edited.
        const edit = await call(api.post(`/store/carts/${cart}/line-items/${head.id}`, { quantity: 1, metadata: { booking_package_pieces: 1 } }, sok))
        expect(edit.status).toBe(400)

        const {
          data: { payment_collection },
        } = await api.post("/store/payment-collections", { cart_id: cart }, sok)
        await api.post(`/store/payment-collections/${payment_collection.id}/payment-sessions`, { provider_id: "pp_system_default" }, sok)
        const done = await api.post(`/store/carts/${cart}/complete`, {}, sok)
        expect([done.data.type, done.data.order.total]).toEqual(["order", 20])
      })

      it("adds nothing when a piece has no room that day, and says which", async () => {
        const sok = await customer("sok@example.com")
        // Both 50-guest tents are out that day.
        const {
          data: [tent],
        } = await query().graph({ entity: "product_variant", fields: ["booking_resources.id"], filters: { sku: "TENT-50" } })
        const res = (tent as any).booking_resources[0].id
        await service().createBookings({
          resource_id: res,
          starts_at: zonedTimeToUtc(monday, "00:00", "Asia/Phnom_Penh"),
          ends_at: new Date(zonedTimeToUtc(monday, "00:00", "Asia/Phnom_Penh").getTime() + 86_400_000),
          status: "confirmed",
          seats: 2,
        })
        const cart = (await api.post("/store/carts", { region_id: regionId }, sok)).data.cart.id
        const r = await book(sok, cart)
        expect([r.status, r.data.unavailable]).toEqual([400, ["Wedding tent (50 guests)"]])
        expect(await lines(sok, cart)).toEqual([])
      })

      it("keeps a package whole: not alone, not without a piece", async () => {
        const sok = await customer("sok@example.com")
        const cart = (await api.post("/store/carts", { region_id: regionId }, sok)).data.cart.id
        const alone = await call(api.post(`/store/carts/${cart}/line-items`, { variant_id: await pkgVariant(), quantity: 1 }, sok))
        expect([alone.status, alone.data.message]).toEqual([400, PACKAGE_ALONE_MESSAGE])
        await book(sok, cart)
        const piece = (await lines(sok, cart)).find((i) => i.product_title === "Haircut")
        await api.delete(`/store/carts/${cart}/line-items/${piece.id}`, sok)
        const {
          data: { payment_collection },
        } = await api.post("/store/payment-collections", { cart_id: cart }, sok)
        await api.post(`/store/payment-collections/${payment_collection.id}/payment-sessions`, { provider_id: "pp_system_default" }, sok)
        const done = await call(api.post(`/store/carts/${cart}/complete`, {}, sok))
        expect(done.data.type === "order").toBe(false)
        expect(JSON.stringify(done.data)).toContain(PACKAGE_INCOMPLETE_MESSAGE)
      })
    })
  },
})
