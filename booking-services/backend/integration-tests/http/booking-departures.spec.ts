import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createDefaultsWorkflow, createShippingProfilesWorkflow } from "@medusajs/medusa/core-flows"
import { BOOKING_QUANTITY_MESSAGE } from "../../src/lib/booking-cart-rules"
import { BOOKING_MODULE } from "../../src/modules/booking"
import type BookingModuleService from "../../src/modules/booking/service"
import seed from "../../src/scripts/seed"
import seedBookingDemo from "../../src/scripts/seed-booking-demo"
import { DEPARTURE_SEATS_MESSAGE } from "../../src/workflows/add-booking-to-cart"

jest.setTimeout(240 * 1000)

const monday = (() => {
  const d = new Date(Date.now() + 7 * 24 * 3600 * 1000)
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7))
  return d.toISOString().slice(0, 10)
})()

// TASKS P3-23 (plan §9.3 kind D): fixed departures per route, several seats
// per booking. The vehicle's seats are its capacity; a booking takes its
// seats at once; the line's quantity is the seats and can't be changed.
medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("scheduled departures (TASKS P3-23)", () => {
      let store: { headers: Record<string, string> }
      let regionId: string
      const query = () => getContainer().resolve(ContainerRegistrationKeys.QUERY)
      const booking = () => getContainer().resolve<BookingModuleService>(BOOKING_MODULE)
      const call = (request: Promise<any>) =>
        request.then(
          (r) => r,
          (e) => e.response
        )
      const route = async (handle: string) => {
        const {
          data: [product],
        } = await query().graph({ entity: "product", fields: ["variants.id"], filters: { handle } })
        return product.variants![0]!.id
      }
      const departures = async (variantId: string) =>
        (await api.get(`/store/booking/slots?variant_id=${variantId}&date=${monday}`, store)).data.slots as {
          resource_id: string
          starts_at: string
          ends_at: string
          remaining: number
        }[]
      const book = async (variantId: string, slot: { resource_id: string; starts_at: string; ends_at: string }, seats?: number) => {
        const cart = (await api.post("/store/carts", { region_id: regionId, email: "sok@example.com" }, store)).data.cart.id
        const res = await call(
          api.post(
            "/store/booking/cart",
            { cart_id: cart, variant_id: variantId, resource_id: slot.resource_id, starts_at: slot.starts_at, ends_at: slot.ends_at, ...(seats !== undefined ? { seats } : {}) },
            store
          )
        )
        return { cart, res }
      }

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

      it("offers each departure once with its free seats; seats are the line's quantity", async () => {
        const bus = await route("bus-siem-reap-phnom-penh")
        const slots = await departures(bus)
        // 07:00 and 13:30 Phnom Penh time, 6 hours each, 40 seats.
        expect(slots.map((s) => [s.starts_at.slice(11, 16), (Date.parse(s.ends_at) - Date.parse(s.starts_at)) / 3600_000, s.remaining])).toEqual([
          ["00:00", 6, 40],
          ["06:30", 6, 40],
        ])
        const { cart, res } = await book(bus, slots[0], 3)
        expect(res.status).toBe(200)
        const { data } = await api.get(`/store/carts/${cart}`, store)
        const item = data.cart.items[0]
        expect([item.quantity, item.unit_price, data.cart.total, item.metadata.booking_seats]).toEqual([3, 12, 36, 3])
        const [held] = await booking().listBookings({ id: res.data.booking.id })
        expect(held.seats).toBe(3)
        expect((await departures(bus)).map((s) => s.remaining)).toEqual([37, 40])

        // The quantity stays the seats booked.
        const changed = await call(api.post(`/store/carts/${cart}/line-items/${item.id}`, { quantity: 5 }, store))
        expect(changed.data.message).toBe(BOOKING_QUANTITY_MESSAGE)
        // No seats given = one.
        const one = await book(bus, slots[1])
        expect((await api.get(`/store/carts/${one.cart}`, store)).data.cart.items[0].quantity).toBe(1)
      })

      it("never sells more seats than the vehicle has, nor more per booking than allowed", async () => {
        const tour = await route("angkor-sunrise-tour")
        const [sunrise] = await departures(tour)
        expect(sunrise.remaining).toBe(12)
        expect((await book(tour, sunrise, 9)).res.data.message).toBe(DEPARTURE_SEATS_MESSAGE)
        expect((await book(tour, sunrise, 0)).res.status).toBe(400)
        expect((await book(tour, sunrise, 8)).res.status).toBe(200)
        // 4 left: 5 don't fit, 4 do, then the departure is full and no longer offered.
        expect((await book(tour, sunrise, 5)).res.status).toBeGreaterThanOrEqual(400)
        expect((await book(tour, sunrise, 4)).res.status).toBe(200)
        expect(await departures(tour)).toEqual([])
        expect((await book(tour, sunrise, 1)).res.status).toBeGreaterThanOrEqual(400)
      })

      it("checks out a multi-seat booking and confirms it with its seats", async () => {
        const tour = await route("angkor-sunrise-tour")
        const [sunrise] = await departures(tour)
        const { cart, res } = await book(tour, sunrise, 2)
        const {
          data: { payment_collection },
        } = await api.post("/store/payment-collections", { cart_id: cart }, store)
        await api.post(`/store/payment-collections/${payment_collection.id}/payment-sessions`, { provider_id: "pp_system_default" }, store)
        const done = await api.post(`/store/carts/${cart}/complete`, {}, store)
        expect([done.data.type, done.data.order.total]).toEqual(["order", 50])
        let status = ""
        for (let i = 0; i < 40 && status !== "confirmed"; i++) {
          status = (await booking().listBookings({ id: res.data.booking.id }))[0].status
          if (status !== "confirmed") await new Promise((r) => setTimeout(r, 250))
        }
        expect(status).toBe("confirmed")
        expect((await departures(tour))[0].remaining).toBe(10)
      })
    })
  },
})
