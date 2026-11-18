import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { createDefaultsWorkflow, createShippingProfilesWorkflow } from "@medusajs/medusa/core-flows"
import jwt from "jsonwebtoken"
import { REVIEW_NOT_YET_MESSAGE, REVIEW_REQUEST_TEMPLATE, REVIEW_TWICE_MESSAGE } from "../../src/lib/reviews"
import { sendReviewRequestsWorkflow } from "../../src/workflows/send-review-requests"
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

// TASKS P3-29: a customer reviews a booking they had, once; it shows on the
// service's page with the average until staff hide it.
medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("reviews (TASKS P3-29)", () => {
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

      it("reviews a booking once after it took place, and staff can hide it", async () => {
        const sok = await customer("sok@example.com")
        const id = await bookAndPay(sok, (await slots())[0])
        const write = (who: any, body: any) => call(api.post("/store/booking/reviews", { booking_id: id, ...body }, who))

        const early = await write(sok, { rating: 5 })
        expect([early.status, early.data.message]).toEqual([400, REVIEW_NOT_YET_MESSAGE])
        // It took place yesterday.
        const y = new Date(Date.now() - 24 * 3600_000)
        await service().updateBookings({ id, starts_at: y, ends_at: new Date(y.getTime() + 30 * 60_000) })

        // The hourly job asks for a review once (P3-29 follow-up).
        const asked = (await sendReviewRequestsWorkflow(getContainer()).run({ input: {} })).result
        expect(asked.map((n) => [n.template, n.data.service])).toEqual([[REVIEW_REQUEST_TEMPLATE, "Haircut"]])
        expect((await sendReviewRequestsWorkflow(getContainer()).run({ input: {} })).result).toEqual([])

        expect((await call(api.post("/store/booking/reviews", { booking_id: id, rating: 5 }, store))).status).toBe(401)
        const dara = await customer("dara@example.com")
        expect((await write(dara, { rating: 1 })).status).toBe(404)
        expect((await write(sok, { rating: 6 })).status).toBe(400)

        const ok = await write(sok, { rating: 4, comment: " Quick and friendly. " })
        expect(ok.data.review).toMatchObject({ rating: 4, comment: "Quick and friendly.", author: "Sok C.", status: "published" })
        const twice = await write(sok, { rating: 5 })
        expect([twice.status, twice.data.message]).toEqual([400, REVIEW_TWICE_MESSAGE])
        expect((await api.get("/store/customers/me/bookings", sok)).data.bookings[0]).toMatchObject({ reviewed: true, product_id: productId })

        const page = (await api.get(`/store/booking/reviews?product_id=${productId}`, store)).data
        expect([page.average, page.count, page.reviews.map((r: any) => [r.rating, r.author])]).toEqual([4, 1, [[4, "Sok C."]]])

        const listed = (await api.get("/admin/booking/reviews", admin)).data.reviews
        expect(listed.map((r: any) => [r.service, r.rating, r.status])).toEqual([["Haircut", 4, "published"]])
        // The shop answers it publicly (P3-29 follow-up).
        await api.post(`/admin/booking/reviews/${listed[0].id}`, { reply: " Thank you, see you soon! " }, admin)
        expect((await api.get(`/store/booking/reviews?product_id=${productId}`, store)).data.reviews[0].reply).toBe("Thank you, see you soon!")
        await api.post(`/admin/booking/reviews/${listed[0].id}`, { status: "hidden" }, admin)
        expect((await api.get(`/store/booking/reviews?product_id=${productId}`, store)).data).toMatchObject({ average: null, count: 0, reviews: [] })
      })
    })
  },
})
