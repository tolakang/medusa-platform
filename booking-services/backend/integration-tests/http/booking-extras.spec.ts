import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createDefaultsWorkflow, createShippingProfilesWorkflow } from "@medusajs/medusa/core-flows"
import {
  EXTRA_BOOKING_REMOVED_MESSAGE,
  EXTRA_MOVED_MESSAGE,
  EXTRA_NEEDS_BOOKING_MESSAGE,
  EXTRA_NOT_OFFERED_MESSAGE,
} from "../../src/lib/booking-extras"
import seed from "../../src/scripts/seed"
import seedBookingDemo from "../../src/scripts/seed-booking-demo"

jest.setTimeout(240 * 1000)

const monday = (() => {
  const d = new Date(Date.now() + 7 * 24 * 3600 * 1000)
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7))
  return d.toISOString().slice(0, 10)
})()
const at = (minutes: number) => new Date(Date.parse(`${monday}T01:00:00.000Z`) + minutes * 60_000).toISOString()

// TASKS P3-25 (plan §9.3 shared features): extras added with a booking. Only
// extras the service offers, each tied to its booking line; an extra alone,
// or left after its booking is removed, can't be checked out.
medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("extras on a booking (TASKS P3-25)", () => {
      let store: { headers: Record<string, string> }
      let regionId: string
      const query = () => getContainer().resolve(ContainerRegistrationKeys.QUERY)
      const call = (request: Promise<any>) =>
        request.then(
          (r) => r,
          (e) => e.response
        )
      const variantOf = async (handle: string, title?: string) => {
        const {
          data: [product],
        } = await query().graph({
          entity: "product",
          fields: ["variants.id", "variants.title", "variants.booking_resources.id"],
          filters: { handle },
        })
        const v = (title ? product.variants!.find((x) => x!.title === title) : product.variants![0])! as unknown as {
          id: string
          booking_resources?: { id: string }[]
        }
        return { id: v.id, resource: v.booking_resources?.[0]?.id }
      }
      const truckBooking = async (cart: string, extras: { variant_id: string; quantity: number }[], start = 0) => {
        const truck = await variantOf("moving-truck", "Small truck")
        return call(
          api.post(
            "/store/booking/cart",
            {
              cart_id: cart,
              variant_id: truck.id,
              resource_id: truck.resource,
              starts_at: at(start),
              ends_at: at(start + 120),
              address: "#12, St 310, Siem Reap",
              dropoff_address: "Wat Bo village, house 8",
              hours: 2,
              extras,
            },
            store
          )
        )
      }
      const newCart = async () => (await api.post("/store/carts", { region_id: regionId, email: "sok@example.com" }, store)).data.cart.id as string
      const lines = async (cart: string) => (await api.get(`/store/carts/${cart}`, store)).data.cart

      beforeEach(async () => {
        const container = getContainer()
        process.env.BOOKING_DEFAULT_TIMEZONE = "Asia/Phnom_Penh"
        await createShippingProfilesWorkflow(container).run({
          input: { data: [{ name: "Default Shipping Profile", type: "default" }] },
        })
        await createDefaultsWorkflow(container).run()
        await seed({ container })
        await seedBookingDemo({ container })
        const {
          data: [key],
        } = await query().graph({ entity: "api_key", fields: ["token"], filters: { type: "publishable" } })
        store = { headers: { "x-publishable-api-key": key.token } }
        regionId = (await query().graph({ entity: "region", fields: ["id"] })).data[0].id
      })

      it("adds the service's extras with the booking, tied to it, priced per unit", async () => {
        const boxes = await variantOf("packing-boxes")
        const helper = await variantOf("extra-helper")
        const cart = await newCart()
        const res = await truckBooking(cart, [
          { variant_id: boxes.id, quantity: 10 },
          { variant_id: helper.id, quantity: 1 },
        ])
        expect(res.status).toBe(200)
        const c = await lines(cart)
        const byTitle = Object.fromEntries(c.items.map((i: any) => [i.product_title, i]))
        expect([byTitle["Packing boxes"].quantity, byTitle["Packing boxes"].unit_price]).toEqual([10, 2])
        expect(byTitle["Packing boxes"].metadata.booking_extra_for).toBe(res.data.booking.id)
        expect(byTitle["Extra helper"].metadata.booking_extra_for).toBe(res.data.booking.id)
        // 2 hours of the small truck ($30) + 10 boxes ($20) + a helper ($10).
        expect(c.total).toBe(60)
        // An extra can change its quantity, not its booking.
        const box = byTitle["Packing boxes"]
        expect((await call(api.post(`/store/carts/${cart}/line-items/${box.id}`, { quantity: 12 }, store))).status).toBe(200)
        const moved = await call(api.post(`/store/carts/${cart}/line-items/${box.id}`, { quantity: 12, metadata: { booking_extra_for: "book_other" } }, store))
        expect(moved.data.message).toBe(EXTRA_MOVED_MESSAGE)
      })

      it("refuses extras the service doesn't offer, and an extra on its own", async () => {
        const cart = await newCart()
        // The haircut offers no extras; a service isn't an extra.
        const haircut = await variantOf("haircut", "30 min")
        expect((await truckBooking(cart, [{ variant_id: haircut.id, quantity: 1 }])).data.message).toBe(EXTRA_NOT_OFFERED_MESSAGE)
        const boxes = await variantOf("packing-boxes")
        expect((await truckBooking(cart, [{ variant_id: boxes.id, quantity: 21 }])).status).toBe(400)
        const alone = await call(api.post(`/store/carts/${cart}/line-items`, { variant_id: boxes.id, quantity: 1 }, store))
        expect(alone.data.message).toBe(EXTRA_NEEDS_BOOKING_MESSAGE)
        expect((await lines(cart)).items).toEqual([])
      })

      it("won't check out an extra whose booking was removed; with its booking it goes through", async () => {
        const boxes = await variantOf("packing-boxes")
        const cart = await newCart()
        await truckBooking(cart, [{ variant_id: boxes.id, quantity: 5 }])
        const pay = async () => {
          const {
            data: { payment_collection },
          } = await api.post("/store/payment-collections", { cart_id: cart }, store)
          await api.post(`/store/payment-collections/${payment_collection.id}/payment-sessions`, { provider_id: "pp_system_default" }, store)
          return call(api.post(`/store/carts/${cart}/complete`, {}, store))
        }
        const truckLine = (await lines(cart)).items.find((i: any) => i.metadata?.booking_id)
        await api.delete(`/store/carts/${cart}/line-items/${truckLine.id}`, store)
        const refused = await pay()
        expect(refused.data.message ?? refused.data.error?.message).toBe(EXTRA_BOOKING_REMOVED_MESSAGE)

        const fresh = await newCart()
        await truckBooking(fresh, [{ variant_id: boxes.id, quantity: 5 }], 240)
        const {
          data: { payment_collection },
        } = await api.post("/store/payment-collections", { cart_id: fresh }, store)
        await api.post(`/store/payment-collections/${payment_collection.id}/payment-sessions`, { provider_id: "pp_system_default" }, store)
        const done = await call(api.post(`/store/carts/${fresh}/complete`, {}, store))
        expect([done.data.type, done.data.order?.total]).toEqual(["order", 40])
      })
    })
  },
})
