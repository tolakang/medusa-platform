import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { createDefaultsWorkflow, createShippingProfilesWorkflow } from "@medusajs/medusa/core-flows"
import { BOOKING_MODULE } from "../../src/modules/booking"
import type BookingModuleService from "../../src/modules/booking/service"
import seed from "../../src/scripts/seed"
import seedBookingDemo from "../../src/scripts/seed-booking-demo"
import { RENTAL_DATES_MESSAGE } from "../../src/workflows/add-booking-to-cart"

jest.setTimeout(240 * 1000)

// A Monday at least a week ahead, and the days after it.
const day = (() => {
  const d = new Date(Date.now() + 7 * 24 * 3600 * 1000)
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7))
  return (offset: number) => new Date(d.getTime() + offset * 86_400_000).toISOString().slice(0, 10)
})()
// Local midnight in Phnom Penh (UTC+7) of a date, as UTC.
const midnight = (date: string) => new Date(Date.parse(`${date}T00:00:00.000Z`) - 7 * 3600_000).toISOString()

// TASKS P3-22 (plan §9.3 kind E): rent by dates. Days are counted inclusive,
// nights from check-in to check-out; the price is per day or night; an item
// is booked by whole local days, never more of them than the shop has, and
// a day off anywhere in the range closes it.
medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("rentals (TASKS P3-22)", () => {
      let store: { headers: Record<string, string> }
      let regionId: string
      const query = () => getContainer().resolve(ContainerRegistrationKeys.QUERY)
      const booking = () => getContainer().resolve<BookingModuleService>(BOOKING_MODULE)
      const call = (request: Promise<any>) =>
        request.then(
          (r) => r,
          (e) => e.response
        )
      const variant = async (handle: string, title: string) => {
        const {
          data: [product],
        } = await query().graph({
          entity: "product",
          fields: ["variants.id", "variants.title", "variants.booking_resources.id"],
          filters: { handle },
        })
        const v = product.variants!.find((x) => x!.title === title)! as unknown as { id: string; booking_resources: { id: string }[] }
        return { id: v.id, resource: v.booking_resources[0].id }
      }
      const rent = async (v: { id: string; resource: string }, start: string, end: string) => {
        const cart = (await api.post("/store/carts", { region_id: regionId, email: "sok@example.com" }, store)).data.cart.id
        const res = await call(
          api.post("/store/booking/cart", { cart_id: cart, variant_id: v.id, resource_id: v.resource, start_date: start, end_date: end }, store)
        )
        return { cart, res }
      }
      const free = async (v: { id: string }, start: string, end: string) =>
        (await api.get(`/store/booking/rentals?variant_id=${v.id}&start_date=${start}&end_date=${end}`, store)).data

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

      it("rents by the day: inclusive days, whole local days, price per day", async () => {
        const tent = await variant("wedding-tent", "50 guests")
        expect(await free(tent, day(0), day(2))).toEqual({
          unit: "day",
          units: 3,
          items: [expect.objectContaining({ resource_name: "Wedding tent: 50 guests", remaining: 2 })],
        })
        const { cart, res } = await rent(tent, day(0), day(2))
        expect(res.status).toBe(200)
        expect([res.data.booking.starts_at, res.data.booking.ends_at]).toEqual([midnight(day(0)), midnight(day(3))])
        const item = (await api.get(`/store/carts/${cart}`, store)).data.cart.items[0]
        expect([item.unit_price, item.metadata.booking_trip]).toEqual([180, `3 days: ${day(0)} to ${day(2)}`])
        // One of the two tents is taken on those days, and on any day overlapping them.
        expect((await free(tent, day(2), day(4))).items[0].remaining).toBe(1)
        expect((await free(tent, day(3), day(4))).items[0].remaining).toBe(2)
      })

      it("rents by the night and never more items than the shop has", async () => {
        const family = await variant("guesthouse-room", "Family room")
        expect((await free(family, day(0), day(2))).units).toBe(2)
        // Two family rooms: two stays fit, a third overlapping one doesn't.
        expect((await rent(family, day(0), day(2))).res.status).toBe(200)
        expect((await rent(family, day(1), day(3))).res.status).toBe(200)
        const full = await rent(family, day(1), day(2))
        expect(full.res.status).toBeGreaterThanOrEqual(400)
        // Check-out day is free for the next check-in.
        const next = await rent(family, day(2), day(3))
        expect(next.res.status).toBe(200)
        const item = (await api.get(`/store/carts/${next.cart}`, store)).data.cart.items[0]
        expect([item.unit_price, item.metadata.booking_trip]).toEqual([40, `1 night: ${day(2)} to ${day(3)}`])
      })

      it("refuses bad dates, and a day off anywhere in the range", async () => {
        const room = await variant("guesthouse-room", "Double room")
        for (const [start, end] of [
          [day(2), day(1)],
          [day(1), day(1)],
          ["2026-02-30", "2026-03-02"],
          [day(0), day(61)],
        ]) {
          expect((await rent(room, start, end)).res.data.message).toBe(RENTAL_DATES_MESSAGE)
        }
        await booking().createBookingDayOffs({ resource_id: room.resource, date: day(1) })
        expect((await free(room, day(0), day(3))).items[0].remaining).toBe(0)
        expect((await rent(room, day(0), day(3))).res.status).toBeGreaterThanOrEqual(400)
        expect((await free(room, day(2), day(4))).items[0].remaining).toBe(4)
        expect(await booking().listBookings({ resource_id: room.resource })).toEqual([])
      })
    })
  },
})
