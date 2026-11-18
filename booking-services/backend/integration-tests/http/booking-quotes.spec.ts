import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createDefaultsWorkflow, createShippingProfilesWorkflow } from "@medusajs/medusa/core-flows"
import jwt from "jsonwebtoken"
import { QUOTE_ONLY_MESSAGE, QUOTE_TEMPLATE } from "../../src/lib/quotes"
import { expireQuotesWorkflow } from "../../src/workflows/expire-quotes"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"
import seed from "../../src/scripts/seed"
import seedBookingDemo from "../../src/scripts/seed-booking-demo"

jest.setTimeout(240 * 1000)

const monday = (() => {
  const d = new Date(Date.now() + 7 * 24 * 3600 * 1000)
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7))
  return d.toISOString().slice(0, 10)
})()
// 09:00 in Phnom Penh.
const nine = `${monday}T02:00:00.000Z`

// TASKS P3-27 (owner, 2026-11-17: Booking's own quotes, paid online at
// checkout): a customer asks, staff price it and the customer is emailed, the
// accepted quote is booked into the cart at that price, and the order marks
// it accepted. A quote-only service can't be booked without one.
medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("quote first (TASKS P3-27)", () => {
      let store: { headers: Record<string, string> }
      let admin: { headers: Record<string, string> }
      let regionId: string
      let move: { id: string; resource: string }
      const query = () => getContainer().resolve(ContainerRegistrationKeys.QUERY)
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
      const ask = (who: { headers: Record<string, string> }) =>
        api.post(
          "/store/booking/quotes",
          { variant_id: move.id, details: "Two bedrooms, a fridge and a piano.", wished_starts_at: nine, address: "#12, St 310", dropoff_address: "Wat Bo village" },
          who
        )
      const price = (id: string, amount = 180) =>
        api.post(
          `/admin/booking/quotes/${id}`,
          { amount, currency_code: "usd", resource_id: move.resource, starts_at: nine, duration_minutes: 300, reply: "Four movers and the large truck." },
          admin
        )

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
        } = await query().graph({ entity: "product", fields: ["variants.id", "variants.booking_resources.id"], filters: { handle: "full-house-move" } })
        const v = product.variants![0] as unknown as { id: string; booking_resources: { id: string }[] }
        move = { id: v.id, resource: v.booking_resources[0].id }
        const email = "admin@booking.test"
        const user = await container.resolve(Modules.USER).createUsers({ email })
        await container.resolve(Modules.AUTH).createAuthIdentities({
          provider_identities: [{ provider: "emailpass", entity_id: email }],
          app_metadata: { user_id: user.id },
        })
        await container.resolve(Modules.AUTH).updateProvider("emailpass", { entity_id: email, password: "supersecret1" })
        admin = { headers: { authorization: `Bearer ${(await api.post("/auth/user/emailpass", { email, password: "supersecret1" })).data.token}` } }
      })

      it("asks, prices with an email, books at the quoted price and accepts on order", async () => {
        const sok = await customer("sok@example.com")
        expect((await call(api.get("/store/booking/quotes", store))).status).toBe(401)
        const asked = await ask(sok)
        const id = asked.data.quote.id
        expect(asked.data.quote.status).toBe("requested")
        expect((await api.get("/admin/booking/quotes?status=requested", admin)).data.quotes.map((q: any) => [q.id, q.service, q.customer.email])).toEqual([
          [id, "Full house move", "sok@example.com"],
        ])

        expect((await price(id)).data.emailed).toBe(true)
        const { data: sent } = await query().graph({ entity: "notification", fields: ["to", "data"], filters: { template: QUOTE_TEMPLATE } })
        expect(sent.map((n) => [n.to, (n.data as any).amount])).toEqual([["sok@example.com", 180]])
        const mine = (await api.get("/store/booking/quotes", sok)).data.quotes
        expect(mine.map((q: any) => [q.status, q.amount, q.starts_at])).toEqual([["quoted", 180, nine]])

        // Another customer can't see or book it.
        const dara = await customer("dara@example.com")
        expect((await api.get("/store/booking/quotes", dara)).data.quotes).toEqual([])
        const daraCart = (await api.post("/store/carts", { region_id: regionId }, dara)).data.cart.id
        expect((await call(api.post(`/store/booking/quotes/${id}/accept`, { cart_id: daraCart }, dara))).status).toBe(404)

        const cart = (await api.post("/store/carts", { region_id: regionId }, sok)).data.cart.id
        const booked = await api.post(`/store/booking/quotes/${id}/accept`, { cart_id: cart }, sok)
        expect(booked.data.booking).toMatchObject({ starts_at: nine, ends_at: `${monday}T07:00:00.000Z` })
        const line = (await api.get(`/store/carts/${cart}`, sok)).data.cart.items[0]
        expect([line.unit_price, line.metadata.booking_quote_id]).toEqual([180, id])

        const {
          data: { payment_collection },
        } = await api.post("/store/payment-collections", { cart_id: cart }, sok)
        await api.post(`/store/payment-collections/${payment_collection.id}/payment-sessions`, { provider_id: "pp_system_default" }, sok)
        const done = await api.post(`/store/carts/${cart}/complete`, {}, sok)
        expect([done.data.type, done.data.order.total]).toEqual(["order", 180])
        let status = ""
        for (let i = 0; i < 40 && status !== "accepted"; i++) {
          status = (await api.get("/store/booking/quotes", sok)).data.quotes[0].status
          if (status !== "accepted") await new Promise((r) => setTimeout(r, 250))
        }
        expect(status).toBe("accepted")
      })

      it("marks a priced quote expired after its date (the hourly job)", async () => {
        const sok = await customer("sok@example.com")
        const id = (await ask(sok)).data.quote.id
        await price(id)
        const [quote] = (await api.get("/store/booking/quotes", sok)).data.quotes
        expect((await expireQuotesWorkflow(getContainer()).run({ input: {} })).result).toEqual([])
        const after = new Date(Date.parse(quote.valid_until) + 60_000).toISOString()
        expect((await expireQuotesWorkflow(getContainer()).run({ input: { now: after } })).result).toEqual([id])
        const listed = (await api.get("/admin/booking/quotes?status=expired", admin)).data.quotes
        expect(listed.map((q: any) => [q.id, q.status])).toEqual([[id, "expired"]])
      })

      it("takes a deposit on a quoted price, and quotes a rental by its days", async () => {
        // The move takes a 50% deposit.
        const {
          data: [mv],
        } = await query().graph({ entity: "product", fields: ["id", "metadata"], filters: { handle: "full-house-move" } })
        await updateProductsWorkflow(getContainer()).run({ input: { selector: { id: mv.id }, update: { metadata: { ...(mv.metadata ?? {}), deposit_percent: 50 } } } })
        const sok = await customer("sok@example.com")
        const id = (await ask(sok)).data.quote.id
        await price(id, 180)
        const cart = (await api.post("/store/carts", { region_id: regionId }, sok)).data.cart.id
        await api.post(`/store/booking/quotes/${id}/accept`, { cart_id: cart }, sok)
        const {
          data: { payment_collection },
        } = await api.post("/store/payment-collections", { cart_id: cart }, sok)
        const session = await api.post(`/store/payment-collections/${payment_collection.id}/payment-sessions`, { provider_id: "pp_system_default" }, sok)
        expect(Number(session.data.payment_collection.amount)).toBe(90)

        // A double room priced on request for two nights.
        const {
          data: [room],
        } = await query().graph({
          entity: "product",
          fields: ["id", "metadata", "variants.id", "variants.title", "variants.booking_resources.id"],
          filters: { handle: "guesthouse-room" },
        })
        await updateProductsWorkflow(getContainer()).run({ input: { selector: { id: room.id }, update: { metadata: { ...(room.metadata ?? {}), quote_only: true } } } })
        const dbl = room.variants!.find((v) => v!.title === "Double room") as unknown as { id: string; booking_resources: { id: string }[] }
        const asked = await api.post(
          "/store/booking/quotes",
          { variant_id: dbl.id, details: "Two nights for our guests, late arrival.", wished_starts_at: nine },
          sok
        )
        const midnight = new Date(Date.parse(`${monday}T00:00:00+07:00`)).toISOString()
        await api.post(
          `/admin/booking/quotes/${asked.data.quote.id}`,
          { amount: 45, currency_code: "usd", resource_id: dbl.booking_resources[0].id, starts_at: midnight, duration_minutes: 2 * 24 * 60 },
          admin
        )
        const cart2 = (await api.post("/store/carts", { region_id: regionId }, sok)).data.cart.id
        const booked = await call(api.post(`/store/booking/quotes/${asked.data.quote.id}/accept`, { cart_id: cart2 }, sok))
        expect(booked.status).toBe(200)
        const line = (await api.get(`/store/carts/${cart2}`, sok)).data.cart.items[0]
        expect([line.unit_price, line.metadata.booking_starts_at]).toEqual([45, midnight])
      })

      it("refuses a quote-only service without a quote, and a declined quote", async () => {
        const sok = await customer("sok@example.com")
        const cart = (await api.post("/store/carts", { region_id: regionId }, sok)).data.cart.id
        const direct = await call(
          api.post("/store/booking/cart", { cart_id: cart, variant_id: move.id, resource_id: move.resource, starts_at: nine, ends_at: `${monday}T06:00:00.000Z` }, sok)
        )
        expect([direct.status, direct.data.message]).toEqual([400, QUOTE_ONLY_MESSAGE])

        const id = (await ask(sok)).data.quote.id
        // Not priced yet.
        expect((await call(api.post(`/store/booking/quotes/${id}/accept`, { cart_id: cart }, sok))).status).toBe(400)
        await price(id)
        await api.post(`/store/booking/quotes/${id}/decline`, {}, sok)
        expect((await call(api.post(`/store/booking/quotes/${id}/accept`, { cart_id: cart }, sok))).status).toBe(400)
        expect((await call(price(id))).status).toBe(400)

        // A haircut is not quote-only.
        const {
          data: [haircut],
        } = await query().graph({ entity: "product", fields: ["variants.id"], filters: { handle: "haircut" } })
        const r = await call(api.post("/store/booking/quotes", { variant_id: haircut.variants![0]!.id, details: "Just a trim please", wished_starts_at: nine }, sok))
        expect(r.status).toBe(400)
      })
    })
  },
})
